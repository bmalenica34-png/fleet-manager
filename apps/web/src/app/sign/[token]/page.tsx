"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import SignatureCanvas from "react-signature-canvas";
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

type Step = "documents" | "photos" | "signature" | "review";
const STEPS: Step[] = ["documents", "photos", "signature", "review"];

interface ContractSummary {
  id: string;
  dateFrom: string;
  dateTo: string;
  vehicle: { make: string; model: string; licensePlate: string };
  client: { firstName: string; lastName: string; email: string; phone: string };
}

interface FilePreview {
  file: File | null;
  previewUrl: string | null;
}

interface AngleSlot extends FilePreview {
  damageDescription: string;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("hr-HR");
}

export default function SigningWizardPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [contract, setContract] = useState<ContractSummary | null>(null);

  const [step, setStep] = useState<Step>("documents");

  const [phone, setPhone] = useState("");
  const [driverLicense, setDriverLicense] = useState<FilePreview>({ file: null, previewUrl: null });
  const [idDocument, setIdDocument] = useState<FilePreview>({ file: null, previewUrl: null });

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

  const [signatureEmpty, setSignatureEmpty] = useState(true);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const sigCanvasRef = useRef<SignatureCanvas>(null);
  const createdUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    fetch(`/api/sign/${token}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok || body.status !== "ok") {
          setErrorReason(body.status ?? "invalid");
          setLoadState("error");
          return;
        }
        setContract(body.contract);
        setPhone(body.contract.client.phone);
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

  function replaceFilePreview(
    prev: FilePreview,
    file: File | null
  ): FilePreview {
    if (prev.previewUrl) {
      URL.revokeObjectURL(prev.previewUrl);
      createdUrlsRef.current.delete(prev.previewUrl);
    }
    if (!file) return { file: null, previewUrl: null };
    const url = URL.createObjectURL(file);
    createdUrlsRef.current.add(url);
    return { file, previewUrl: url };
  }

  function handleAngleFileChange(angle: PhotoAngle, file: File | null) {
    setAngles((prev) => ({
      ...prev,
      [angle]: { ...replaceFilePreview(prev[angle], file), damageDescription: prev[angle].damageDescription },
    }));
  }

  function handleAngleDamageChange(angle: PhotoAngle, value: string) {
    setAngles((prev) => ({ ...prev, [angle]: { ...prev[angle], damageDescription: value } }));
  }

  const documentsComplete = Boolean(driverLicense.file && idDocument.file && phone.trim());
  const photosComplete = REQUIRED_ANGLES.every((angle) => angles[angle].file);

  function goNext() {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  }

  function goBack() {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  }

  function handleClearSignature() {
    sigCanvasRef.current?.clear();
    setSignatureEmpty(true);
    setSignatureDataUrl(null);
  }

  function handleSignatureNext() {
    if (!sigCanvasRef.current || sigCanvasRef.current.isEmpty()) {
      setSignatureEmpty(true);
      return;
    }
    // Canvas se unmounta kad odemo s ovog koraka (uvjetni render), pa
    // data URL moramo uhvatiti SAD dok ref još postoji - review/submit
    // koraci se onda oslanjaju na ovaj snapshot, ne na sigCanvasRef.
    // getTrimmedCanvas() oslanja se na "trim-canvas" paket koji u ovom
    // bundle okruženju baca "f is not a function" - koristimo sirovi
    // canvas umjesto trimanog (bez cropanja praznog prostora oko potpisa).
    const dataUrl = sigCanvasRef.current.getCanvas().toDataURL("image/png");
    setSignatureDataUrl(dataUrl);
    goNext();
  }

  async function handleSubmit() {
    if (!driverLicense.file || !idDocument.file) return;
    if (!signatureDataUrl) {
      setSubmitError("Potpis je obavezan.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    const formData = new FormData();
    formData.append("phone", phone.trim());
    formData.append("driverLicense", driverLicense.file);
    formData.append("idDocument", idDocument.file);
    REQUIRED_ANGLES.forEach((angle) => {
      const slot = angles[angle];
      if (slot.file) formData.append(`photo_${angle}`, slot.file);
      if (slot.damageDescription.trim()) {
        formData.append(`damage_${angle}`, slot.damageDescription.trim());
      }
    });
    formData.append("signature", signatureDataUrl);

    const res = await fetch(`/api/sign/${token}`, { method: "POST", body: formData });
    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setSubmitError(
        body?.error === "missing_angles"
          ? "Nedostaje slika za jedan od obaveznih kutova."
          : "Greška prilikom slanja. Pokušaj ponovno."
      );
      return;
    }

    setSuccess(true);
  }

  if (loadState === "loading") {
    return <p className="muted">Učitavanje...</p>;
  }

  if (loadState === "error") {
    const message =
      errorReason === "already_signed"
        ? "Ovaj ugovor je već potpisan. Hvala!"
        : errorReason === "expired"
        ? "Link za potpis je istekao. Zatraži novi od najmodavca."
        : "Link za potpis nije važeći.";
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
        <p>Ugovor je uspješno potpisan. Kopiju ugovora ćeš dobiti na email uskoro.</p>
      </div>
    );
  }

  if (!contract) return null;

  return (
    <div>
      <div className="sign-card" style={{ marginBottom: "1rem" }}>
        <h1>
          {contract.vehicle.make} {contract.vehicle.model} ({contract.vehicle.licensePlate})
        </h1>
        <p className="muted">
          Najam: {formatDate(contract.dateFrom)} - {formatDate(contract.dateTo)}
        </p>
        <p className="muted">
          {contract.client.firstName} {contract.client.lastName} ({contract.client.email})
        </p>
      </div>

      <div className="step-indicator">
        {STEPS.map((s) => (
          <span key={s} className={`step-dot${s === step ? " active" : ""}`} />
        ))}
      </div>

      <div className="sign-card">
        {step === "documents" && (
          <div>
            <h2>Dokumenti i kontakt</h2>
            <form>
              <label>
                Telefon
                <input value={phone} onChange={(e) => setPhone(e.target.value)} required />
              </label>
              <label>
                Vozačka dozvola (slika)
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    setDriverLicense((prev) => replaceFilePreview(prev, e.target.files?.[0] ?? null))
                  }
                />
              </label>
              {driverLicense.previewUrl && (
                <img src={driverLicense.previewUrl} alt="Preview vozačke" style={{ maxWidth: "200px", borderRadius: "6px" }} />
              )}
              <label>
                Osobna iskaznica (slika)
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    setIdDocument((prev) => replaceFilePreview(prev, e.target.files?.[0] ?? null))
                  }
                />
              </label>
              {idDocument.previewUrl && (
                <img src={idDocument.previewUrl} alt="Preview osobne" style={{ maxWidth: "200px", borderRadius: "6px" }} />
              )}
            </form>
            <div className="step-actions">
              <span />
              <button className="btn btn-primary" disabled={!documentsComplete} onClick={goNext}>
                Dalje
              </button>
            </div>
          </div>
        )}

        {step === "photos" && (
          <div>
            <h2>Slike vozila</h2>
            <p className="muted">Fotografiraj vozilo iz sva 4 obavezna kuta prije preuzimanja.</p>
            <div className="angle-grid">
              {REQUIRED_ANGLES.map((angle) => {
                const slot = angles[angle];
                return (
                  <div key={angle} className={`angle-slot${slot.file ? " done" : ""}`}>
                    {slot.previewUrl ? (
                      <img src={slot.previewUrl} alt={ANGLE_LABELS[angle]} />
                    ) : null}
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
            <div className="step-actions">
              <button className="btn" onClick={goBack}>
                Natrag
              </button>
              <button className="btn btn-primary" disabled={!photosComplete} onClick={goNext}>
                Dalje
              </button>
            </div>
          </div>
        )}

        {step === "signature" && (
          <div>
            <h2>Potpis</h2>
            <p className="muted">Potpiši se prstom ili mišem u polju ispod.</p>
            <SignatureCanvas
              ref={sigCanvasRef}
              canvasProps={{ className: "signature-pad", height: 200 }}
              onEnd={() => setSignatureEmpty(Boolean(sigCanvasRef.current?.isEmpty()))}
            />
            <button className="btn" onClick={handleClearSignature} style={{ marginTop: "0.5rem" }}>
              Obriši potpis
            </button>
            <div className="step-actions">
              <button className="btn" onClick={goBack}>
                Natrag
              </button>
              <button className="btn btn-primary" disabled={signatureEmpty} onClick={handleSignatureNext}>
                Dalje
              </button>
            </div>
          </div>
        )}

        {step === "review" && (
          <div>
            <h2>Pregled i potpis</h2>
            <p className="muted">Telefon: {phone}</p>
            <p className="muted">Dokumenti i sve 4 slike vozila su spremni.</p>
            {submitError && <p className="error">{submitError}</p>}
            <div className="step-actions">
              <button className="btn" onClick={goBack} disabled={submitting}>
                Natrag
              </button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
                {submitting ? "Slanje..." : "Potpiši i pošalji"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
