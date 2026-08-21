"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { PhotoAngle } from "@rent-a-car/api";
import { compressImageFile } from "@/lib/compressImage";

const REQUIRED_ANGLES: PhotoAngle[] = ["front", "back", "left", "right"];
const ANGLE_LABELS: Record<PhotoAngle, string> = {
  front: "Prednja strana",
  back: "Stražnja strana",
  left: "Lijeva strana",
  right: "Desna strana",
  interior_dashboard: "Unutrašnjost - komandna ploča",
  interior_seats: "Unutrašnjost - sjedala",
  odometer: "Kilometraža",
  other: "Ostalo",
};

interface PhotoRequestSummary {
  vehicle: { make: string; model: string; licensePlate: string };
  client: { firstName: string; lastName: string };
}

interface AngleSlot {
  file: File | null;
  previewUrl: string | null;
  damageDescription: string;
  // Ključ već uploadanog fajla u Hetzneru (presigned PUT, izravno s
  // klijenta - isti obrazac kao signing wizard, vidi bugove #37/#38 u
  // PROGRESS.md). null dok upload nije završio.
  key: string | null;
  uploading: boolean;
  uploadError: string | null;
}

const EMPTY_ANGLE_SLOT: Omit<AngleSlot, "damageDescription"> = {
  file: null,
  previewUrl: null,
  key: null,
  uploading: false,
  uploadError: null,
};

export default function RequestPhotosPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [summary, setSummary] = useState<PhotoRequestSummary | null>(null);

  const [angles, setAngles] = useState<Record<PhotoAngle, AngleSlot>>({
    front: { ...EMPTY_ANGLE_SLOT, damageDescription: "" },
    back: { ...EMPTY_ANGLE_SLOT, damageDescription: "" },
    left: { ...EMPTY_ANGLE_SLOT, damageDescription: "" },
    right: { ...EMPTY_ANGLE_SLOT, damageDescription: "" },
    interior_dashboard: { ...EMPTY_ANGLE_SLOT, damageDescription: "" },
    interior_seats: { ...EMPTY_ANGLE_SLOT, damageDescription: "" },
    odometer: { ...EMPTY_ANGLE_SLOT, damageDescription: "" },
    other: { ...EMPTY_ANGLE_SLOT, damageDescription: "" },
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const createdUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    fetch(`/api/photo-requests/${token}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok || body.status !== "ok") {
          setErrorReason(body.status ?? "invalid");
          setLoadState("error");
          return;
        }
        setSummary(body.photoRequest);
        setLoadState("ready");
      })
      .catch(() => {
        setErrorReason("invalid");
        setLoadState("error");
      });
  }, [token]);

  useEffect(() => {
    const urls = createdUrlsRef.current;
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  /**
   * Uploada fajl izravno u Hetzner preko presigned PUT URL-a, mimo Vercel
   * funkcijskog tijela - isti obrazac kao signing wizard (vidi bugove
   * #37/#38 u PROGRESS.md, uklj. CORS politiku na bucketu koja je već
   * primijenjena za app origin).
   */
  async function uploadToStorage(file: File, angle: PhotoAngle): Promise<string> {
    const urlRes = await fetch(`/api/photo-requests/${token}/upload-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type || "image/jpeg",
        angle,
      }),
    });
    if (!urlRes.ok) throw new Error("upload_url_failed");
    const { key, uploadUrl } = await urlRes.json();

    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "image/jpeg" },
      body: file,
    });
    if (!putRes.ok) throw new Error("upload_failed");

    return key as string;
  }

  async function handleAngleFileChange(angle: PhotoAngle, rawFile: File | null) {
    const file = rawFile ? await compressImageFile(rawFile) : null;

    setAngles((prev) => {
      const existing = prev[angle];
      if (existing.previewUrl) {
        URL.revokeObjectURL(existing.previewUrl);
        createdUrlsRef.current.delete(existing.previewUrl);
      }
      if (!file) {
        return { ...prev, [angle]: { ...EMPTY_ANGLE_SLOT, damageDescription: existing.damageDescription } };
      }
      const url = URL.createObjectURL(file);
      createdUrlsRef.current.add(url);
      return {
        ...prev,
        [angle]: { file, previewUrl: url, key: null, uploading: false, uploadError: null, damageDescription: existing.damageDescription },
      };
    });
    if (!file) return;

    setAngles((prev) => ({ ...prev, [angle]: { ...prev[angle], uploading: true, uploadError: null } }));
    try {
      const key = await uploadToStorage(file, angle);
      setAngles((prev) =>
        prev[angle].file === file ? { ...prev, [angle]: { ...prev[angle], key, uploading: false } } : prev
      );
    } catch {
      setAngles((prev) =>
        prev[angle].file === file
          ? { ...prev, [angle]: { ...prev[angle], uploading: false, uploadError: "Upload nije uspio. Pokušaj ponovno." } }
          : prev
      );
    }
  }

  function handleAngleDamageChange(angle: PhotoAngle, value: string) {
    setAngles((prev) => ({ ...prev, [angle]: { ...prev[angle], damageDescription: value } }));
  }

  const photosComplete = REQUIRED_ANGLES.every((angle) => angles[angle].key);

  async function handleSubmit() {
    if (!photosComplete) return;
    setSubmitting(true);
    setSubmitError(null);

    const photos = REQUIRED_ANGLES.map((angle) => ({
      angle,
      key: angles[angle].key as string,
      damageDescription: angles[angle].damageDescription.trim() || undefined,
    }));

    const res = await fetch(`/api/photo-requests/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photos }),
    });
    setSubmitting(false);

    if (!res.ok) {
      setSubmitError("Greška prilikom slanja. Pokušaj ponovno.");
      return;
    }

    setSuccess(true);
  }

  if (loadState === "loading") {
    return <p className="muted">Učitavanje...</p>;
  }

  if (loadState === "error") {
    const message =
      errorReason === "already_fulfilled"
        ? "Slike su već poslane za ovaj zahtjev. Hvala!"
        : errorReason === "expired"
        ? "Link za upload slika je istekao. Zatraži novi od najmodavca."
        : "Link nije važeći.";
    return (
      <div className="sign-card">
        <p>{message}</p>
      </div>
    );
  }

  if (success) {
    return (
      <div className="sign-card">
        <h1>Hvala!</h1>
        <p>Slike vozila su uspješno poslane najmodavcu.</p>
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div>
      <div className="sign-card" style={{ marginBottom: "1rem" }}>
        <h1>
          {summary.vehicle.make} {summary.vehicle.model} ({summary.vehicle.licensePlate})
        </h1>
        <p className="muted">
          {summary.client.firstName} {summary.client.lastName}
        </p>
      </div>

      <div className="sign-card">
        <h2>Slike vozila</h2>
        <p className="muted">Najmodavac je zatražio svježe slike vozila iz sva 4 kuta.</p>
        <div className="angle-grid">
          {REQUIRED_ANGLES.map((angle) => {
            const slot = angles[angle];
            return (
              <div key={angle} className={`angle-slot${slot.key ? " done" : ""}`}>
                {slot.previewUrl ? <img src={slot.previewUrl} alt={ANGLE_LABELS[angle]} /> : null}
                <div>{ANGLE_LABELS[angle]}</div>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => handleAngleFileChange(angle, e.target.files?.[0] ?? null)}
                />
                {slot.uploading && <p className="muted">Uploadam...</p>}
                {slot.uploadError && <p className="error">{slot.uploadError}</p>}
                <textarea
                  placeholder="Opis oštećenja (opcionalno)"
                  value={slot.damageDescription}
                  onChange={(e) => handleAngleDamageChange(angle, e.target.value)}
                />
              </div>
            );
          })}
        </div>

        {submitError && <p className="error">{submitError}</p>}

        <div className="step-actions">
          <span />
          <button className="btn btn-primary" onClick={handleSubmit} disabled={!photosComplete || submitting}>
            {submitting ? "Slanje..." : "Pošalji slike"}
          </button>
        </div>
      </div>
    </div>
  );
}
