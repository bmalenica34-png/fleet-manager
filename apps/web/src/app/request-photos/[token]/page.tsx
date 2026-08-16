"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { PhotoAngle } from "@rent-a-car/api";

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
}

export default function RequestPhotosPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [summary, setSummary] = useState<PhotoRequestSummary | null>(null);

  const [angles, setAngles] = useState<Record<PhotoAngle, AngleSlot>>({
    front: { file: null, previewUrl: null, damageDescription: "" },
    back: { file: null, previewUrl: null, damageDescription: "" },
    left: { file: null, previewUrl: null, damageDescription: "" },
    right: { file: null, previewUrl: null, damageDescription: "" },
    interior_dashboard: { file: null, previewUrl: null, damageDescription: "" },
    interior_seats: { file: null, previewUrl: null, damageDescription: "" },
    odometer: { file: null, previewUrl: null, damageDescription: "" },
    other: { file: null, previewUrl: null, damageDescription: "" },
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

  function handleAngleFileChange(angle: PhotoAngle, file: File | null) {
    setAngles((prev) => {
      const existing = prev[angle];
      if (existing.previewUrl) {
        URL.revokeObjectURL(existing.previewUrl);
        createdUrlsRef.current.delete(existing.previewUrl);
      }
      if (!file) {
        return { ...prev, [angle]: { file: null, previewUrl: null, damageDescription: existing.damageDescription } };
      }
      const url = URL.createObjectURL(file);
      createdUrlsRef.current.add(url);
      return { ...prev, [angle]: { file, previewUrl: url, damageDescription: existing.damageDescription } };
    });
  }

  function handleAngleDamageChange(angle: PhotoAngle, value: string) {
    setAngles((prev) => ({ ...prev, [angle]: { ...prev[angle], damageDescription: value } }));
  }

  const photosComplete = REQUIRED_ANGLES.every((angle) => angles[angle].file);

  async function handleSubmit() {
    if (!photosComplete) return;
    setSubmitting(true);
    setSubmitError(null);

    const formData = new FormData();
    REQUIRED_ANGLES.forEach((angle) => {
      const slot = angles[angle];
      if (slot.file) formData.append(`photo_${angle}`, slot.file);
      if (slot.damageDescription.trim()) {
        formData.append(`damage_${angle}`, slot.damageDescription.trim());
      }
    });

    const res = await fetch(`/api/photo-requests/${token}`, { method: "POST", body: formData });
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
              <div key={angle} className={`angle-slot${slot.file ? " done" : ""}`}>
                {slot.previewUrl ? <img src={slot.previewUrl} alt={ANGLE_LABELS[angle]} /> : null}
                <div>{ANGLE_LABELS[angle]}</div>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => handleAngleFileChange(angle, e.target.files?.[0] ?? null)}
                />
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
