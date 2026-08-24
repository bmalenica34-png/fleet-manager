"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import SignatureCanvas from "react-signature-canvas";
import type { PhotoAngle, VehiclePart } from "@rent-a-car/api";
import { compressImageFile } from "@/lib/compressImage";
import { formatDateHr as formatDate } from "@rent-a-car/api";

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

const VEHICLE_PART_LABELS: Record<VehiclePart, string> = {
  front_bumper: "Prednji branik",
  rear_bumper: "Stražnji branik",
  hood: "Haube",
  trunk: "Prtljažnik",
  roof: "Krov",
  windshield: "Vjetrobransko staklo",
  rear_window: "Stražnje staklo",
  left_front_door: "Lijeva prednja vrata",
  left_rear_door: "Lijeva stražnja vrata",
  right_front_door: "Desna prednja vrata",
  right_rear_door: "Desna stražnja vrata",
  left_front_fender: "Lijevo prednje blatobran",
  right_front_fender: "Desno prednje blatobran",
  left_rear_fender: "Lijevo stražnje blatobran",
  right_rear_fender: "Desno stražnje blatobran",
  left_mirror: "Lijevo bočno ogledalo",
  right_mirror: "Desno bočno ogledalo",
  left_front_wheel: "Lijeva prednja guma/naplatak",
  right_front_wheel: "Desna prednja guma/naplatak",
  left_rear_wheel: "Lijeva stražnja guma/naplatak",
  right_rear_wheel: "Desna stražnja guma/naplatak",
  headlight_left: "Lijevo prednje svjetlo",
  headlight_right: "Desno prednje svjetlo",
  taillight_left: "Lijevo stražnje svjetlo",
  taillight_right: "Desno stražnje svjetlo",
  interior: "Unutrašnjost",
  other: "Ostalo",
};
const VEHICLE_PART_OPTIONS = Object.keys(VEHICLE_PART_LABELS) as VehiclePart[];

type Step = "documents" | "photos" | "terms" | "signature" | "review";
const STEPS: Step[] = ["documents", "photos", "terms", "signature", "review"];

interface ContractSummary {
  id: string;
  dateFrom: string;
  dateTo: string;
  vehicle: { make: string; model: string; licensePlate: string };
  client: { firstName: string; lastName: string; email: string; phone: string };
}

// Aktivna verzija uvjeta najma, dobivena s servera (GET /api/sign/[token]) -
// NE hardkodirano, vidi packages/api/src/schemas/terms.ts i /settings
// stranicu gdje owner uređuje sadržaj.
interface ActiveTerms {
  id: string;
  version: number;
  content: string;
}

interface FilePreview {
  file: File | null;
  previewUrl: string | null;
  // Ključ već uploadanog fajla u Hetzneru (presigned PUT, izravno s
  // klijenta - vidi uploadToStorage niže i bug #37 u PROGRESS.md). null dok
  // upload nije završio - "Dalje"/submit ostaju blokirani dok god je ovo
  // null za obavezne fajlove, ne samo dok `file` nije postavljen.
  key: string | null;
  uploading: boolean;
  uploadError: string | null;
}

const EMPTY_FILE_PREVIEW: FilePreview = {
  file: null,
  previewUrl: null,
  key: null,
  uploading: false,
  uploadError: null,
};

interface AngleSlot extends FilePreview {
  damageDescription: string;
}

interface DamageEntry extends FilePreview {
  id: string;
  part: VehiclePart | "";
  description: string;
}

export default function SigningWizardPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [contract, setContract] = useState<ContractSummary | null>(null);
  const [terms, setTerms] = useState<ActiveTerms | null>(null);

  const [step, setStep] = useState<Step>("documents");

  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [driverLicense, setDriverLicense] = useState<FilePreview>(EMPTY_FILE_PREVIEW);
  const [idDocument, setIdDocument] = useState<FilePreview>(EMPTY_FILE_PREVIEW);

  const [angles, setAngles] = useState<Record<PhotoAngle, AngleSlot>>({
    front: { ...EMPTY_FILE_PREVIEW, damageDescription: "" },
    back: { ...EMPTY_FILE_PREVIEW, damageDescription: "" },
    left: { ...EMPTY_FILE_PREVIEW, damageDescription: "" },
    right: { ...EMPTY_FILE_PREVIEW, damageDescription: "" },
    interior_dashboard: { ...EMPTY_FILE_PREVIEW, damageDescription: "" },
    interior_seats: { ...EMPTY_FILE_PREVIEW, damageDescription: "" },
    odometer: { ...EMPTY_FILE_PREVIEW, damageDescription: "" },
    other: { ...EMPTY_FILE_PREVIEW, damageDescription: "" },
  });

  const [damages, setDamages] = useState<DamageEntry[]>([]);

  const [termsScrolledToBottom, setTermsScrolledToBottom] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

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
        setTerms(body.terms);
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
    if (!file) return EMPTY_FILE_PREVIEW;
    const url = URL.createObjectURL(file);
    createdUrlsRef.current.add(url);
    return { file, previewUrl: url, key: null, uploading: false, uploadError: null };
  }

  /**
   * Uploada fajl izravno u Hetzner preko presigned PUT URL-a, mimo Vercel
   * funkcijskog tijela - vidi bug #37 u PROGRESS.md. Prijašnji pristup
   * (svi fajlovi u jednom multipart submitu) je udarao u Vercelov tvrdi
   * ~4.5MB limit za tijelo zahtjeva čim bi se dokumenti + 4 slike +
   * oštećenja zbrojili, i to bi se dogodilo PRIJE nego bilo koji app kod
   * uopće proradi (413 na platform razini, bez loga u funkciji).
   */
  async function uploadToStorage(
    file: File,
    purpose: "driverLicense" | "idDocument" | "photo" | "damagePhoto",
    angle?: PhotoAngle
  ): Promise<string> {
    const urlRes = await fetch(`/api/sign/${token}/upload-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        purpose,
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
    setAngles((prev) => ({
      ...prev,
      [angle]: { ...replaceFilePreview(prev[angle], file), damageDescription: prev[angle].damageDescription },
    }));
    if (!file) return;

    setAngles((prev) => ({ ...prev, [angle]: { ...prev[angle], uploading: true, uploadError: null } }));
    try {
      const key = await uploadToStorage(file, "photo", angle);
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

  async function handleDriverLicenseChange(rawFile: File | null) {
    const file = rawFile ? await compressImageFile(rawFile) : null;
    setDriverLicense((prev) => replaceFilePreview(prev, file));
    if (!file) return;

    setDriverLicense((prev) => ({ ...prev, uploading: true, uploadError: null }));
    try {
      const key = await uploadToStorage(file, "driverLicense");
      setDriverLicense((prev) => (prev.file === file ? { ...prev, key, uploading: false } : prev));
    } catch {
      setDriverLicense((prev) =>
        prev.file === file ? { ...prev, uploading: false, uploadError: "Upload nije uspio. Pokušaj ponovno." } : prev
      );
    }
  }

  async function handleIdDocumentChange(rawFile: File | null) {
    const file = rawFile ? await compressImageFile(rawFile) : null;
    setIdDocument((prev) => replaceFilePreview(prev, file));
    if (!file) return;

    setIdDocument((prev) => ({ ...prev, uploading: true, uploadError: null }));
    try {
      const key = await uploadToStorage(file, "idDocument");
      setIdDocument((prev) => (prev.file === file ? { ...prev, key, uploading: false } : prev));
    } catch {
      setIdDocument((prev) =>
        prev.file === file ? { ...prev, uploading: false, uploadError: "Upload nije uspio. Pokušaj ponovno." } : prev
      );
    }
  }

  function handleAngleDamageChange(angle: PhotoAngle, value: string) {
    setAngles((prev) => ({ ...prev, [angle]: { ...prev[angle], damageDescription: value } }));
  }

  function addDamageEntry() {
    setDamages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), part: "", ...EMPTY_FILE_PREVIEW, description: "" },
    ]);
  }

  function removeDamageEntry(id: string) {
    setDamages((prev) => {
      const target = prev.find((d) => d.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
        createdUrlsRef.current.delete(target.previewUrl);
      }
      return prev.filter((d) => d.id !== id);
    });
  }

  function updateDamagePart(id: string, part: VehiclePart) {
    setDamages((prev) => prev.map((d) => (d.id === id ? { ...d, part } : d)));
  }

  async function handleDamageFileChange(id: string, rawFile: File | null) {
    const file = rawFile ? await compressImageFile(rawFile) : null;
    setDamages((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...replaceFilePreview(d, file) } : d))
    );
    if (!file) return;

    setDamages((prev) => prev.map((d) => (d.id === id ? { ...d, uploading: true, uploadError: null } : d)));
    try {
      const key = await uploadToStorage(file, "damagePhoto");
      setDamages((prev) =>
        prev.map((d) => (d.id === id && d.file === file ? { ...d, key, uploading: false } : d))
      );
    } catch {
      setDamages((prev) =>
        prev.map((d) =>
          d.id === id && d.file === file
            ? { ...d, uploading: false, uploadError: "Upload nije uspio. Pokušaj ponovno." }
            : d
        )
      );
    }
  }

  function updateDamageDescription(id: string, value: string) {
    setDamages((prev) => prev.map((d) => (d.id === id ? { ...d, description: value } : d)));
  }

  function handleTermsScroll(event: React.UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    // Mala tolerancija (10px) - točan scrollHeight-clientHeight rijetko
    // pogodi na dlaku zbog zaokruživanja, pa striktan >= zna promašiti.
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 10) {
      setTermsScrolledToBottom(true);
    }
  }

  const documentsComplete = Boolean(driverLicense.key && idDocument.key && phone.trim());
  const damagesComplete = damages.every((d) => d.part && d.key);
  const photosComplete = REQUIRED_ANGLES.every((angle) => angles[angle].key) && damagesComplete;

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
    if (!driverLicense.key || !idDocument.key) return;
    if (!termsAccepted) {
      setSubmitError("Uvjeti najma moraju biti prihvaćeni.");
      return;
    }
    if (!signatureDataUrl) {
      setSubmitError("Potpis je obavezan.");
      return;
    }
    if (!terms) {
      setSubmitError("Uvjeti najma trenutno nisu dostupni. Osvježi stranicu i pokušaj ponovno.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    // Fajlovi su već uploadani izravno u Hetzner tijekom čekiranja koraka
    // (vidi uploadToStorage) - ovaj submit šalje samo male ključeve/
    // metapodatke kao JSON, ne binarni sadržaj. Vidi bug #37 u PROGRESS.md.
    const photos = REQUIRED_ANGLES.map((angle) => ({
      angle,
      key: angles[angle].key as string,
      damageDescription: angles[angle].damageDescription.trim() || undefined,
    }));

    const damagePhotos = damages
      .filter((d) => d.part && d.key)
      .map((d) => ({
        part: d.part as VehiclePart,
        key: d.key as string,
        description: d.description.trim() || undefined,
      }));

    const res = await fetch(`/api/sign/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: phone.trim(),
        address: address.trim() || undefined,
        termsAccepted: true,
        termsId: terms.id,
        driverLicenseKey: driverLicense.key,
        idDocumentKey: idDocument.key,
        photos,
        damagePhotos,
        signature: signatureDataUrl,
      }),
    });
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
                Adresa (opcionalno)
                <input value={address} onChange={(e) => setAddress(e.target.value)} />
              </label>
              <label>
                Vozačka dozvola (slika)
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleDriverLicenseChange(e.target.files?.[0] ?? null)}
                />
              </label>
              {driverLicense.previewUrl && (
                <img src={driverLicense.previewUrl} alt="Preview vozačke" style={{ maxWidth: "200px", borderRadius: "6px" }} />
              )}
              {driverLicense.uploading && <p className="muted">Uploadam...</p>}
              {driverLicense.uploadError && <p className="error">{driverLicense.uploadError}</p>}
              <label>
                Osobna iskaznica (slika)
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleIdDocumentChange(e.target.files?.[0] ?? null)}
                />
              </label>
              {idDocument.previewUrl && (
                <img src={idDocument.previewUrl} alt="Preview osobne" style={{ maxWidth: "200px", borderRadius: "6px" }} />
              )}
              {idDocument.uploading && <p className="muted">Uploadam...</p>}
              {idDocument.uploadError && <p className="error">{idDocument.uploadError}</p>}
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
                  <div key={angle} className={`angle-slot${slot.key ? " done" : ""}`}>
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

            <h3 style={{ marginTop: "1.5rem" }}>Oštećenja (opcionalno)</h3>
            <p className="muted">
              Ako je vozilo oštećeno, odaberi koji dio i slikaj konkretno oštećenje. Možeš dodati
              više oštećenja.
            </p>
            <div className="damage-list">
              {damages.map((d) => (
                <div key={d.id} className="damage-row">
                  <select
                    value={d.part}
                    onChange={(e) => updateDamagePart(d.id, e.target.value as VehiclePart)}
                  >
                    <option value="" disabled>
                      Odaberi dio vozila
                    </option>
                    {VEHICLE_PART_OPTIONS.map((part) => (
                      <option key={part} value={part}>
                        {VEHICLE_PART_LABELS[part]}
                      </option>
                    ))}
                  </select>
                  {d.previewUrl && <img src={d.previewUrl} alt="Slika oštećenja" />}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => handleDamageFileChange(d.id, e.target.files?.[0] ?? null)}
                  />
                  {d.uploading && <p className="muted">Uploadam...</p>}
                  {d.uploadError && <p className="error">{d.uploadError}</p>}
                  <textarea
                    placeholder="Opis oštećenja (opcionalno)"
                    value={d.description}
                    onChange={(e) => updateDamageDescription(d.id, e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => removeDamageEntry(d.id)}
                  >
                    Ukloni oštećenje
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="btn" onClick={addDamageEntry}>
              + Dodaj još jedno oštećenje
            </button>

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

        {step === "terms" && (
          <div>
            <h2>Uvjeti najma</h2>
            <p className="muted">Pročitaj uvjete do kraja prije nego ih možeš prihvatiti.</p>
            <div className="terms-box" onScroll={handleTermsScroll}>
              {terms ? (
                terms.content.split("\n\n").map((paragraph, i) => (
                  <p key={i} style={{ marginBottom: "0.75rem", whiteSpace: "pre-line" }}>
                    {paragraph}
                  </p>
                ))
              ) : (
                <p className="error">Uvjeti najma trenutno nisu dostupni.</p>
              )}
            </div>
            <label style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem", marginTop: "0.75rem" }}>
              <input
                type="checkbox"
                checked={termsAccepted}
                disabled={!termsScrolledToBottom}
                onChange={(e) => setTermsAccepted(e.target.checked)}
              />
              Pročitao/la sam i prihvaćam uvjete najma
            </label>
            {!termsScrolledToBottom && (
              <p className="muted">Doscrolaj do dna teksta da bi mogao/la prihvatiti uvjete.</p>
            )}
            <div className="step-actions">
              <button className="btn" onClick={goBack}>
                Natrag
              </button>
              <button className="btn btn-primary" disabled={!termsAccepted} onClick={goNext}>
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
            <p className="muted">
              {damages.length > 0
                ? `Prijavljeno oštećenja: ${damages.length}.`
                : "Nema prijavljenih oštećenja."}
            </p>
            <p className="muted">Uvjeti najma prihvaćeni.</p>
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
