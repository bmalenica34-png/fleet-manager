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

// Placeholder tekst - zamijeniti pravim pravnim tekstom kad stigne. Kad se
// zamijeni, TERMS_VERSION MORA se promijeniti (npr. "v2") - to je vrijednost
// koja se sprema uz svaki potpisan ugovor (Contract.termsVersion), da se
// zna točno koju verziju je konkretni klijent vidio i prihvatio.
const TERMS_VERSION = "placeholder-v1";
const TERMS_TEXT = `1. Predmet ugovora
Ovim Uvjetima najma uređuju se prava i obveze najmodavca i najmoprimca u vezi s najmom vozila opisanog u ugovoru. Potpisom ugovora najmoprimac potvrđuje da je pročitao, razumio i prihvatio ove uvjete u cijelosti.

2. Korištenje vozila
Vozilo smije upravljati isključivo osoba navedena kao najmoprimac (ili dodatni vozač naveden u ugovoru), koja posjeduje važeću vozačku dozvolu odgovarajuće kategorije. Vozilo se ne smije koristiti za prijevoz osoba ili stvari uz naknadu, sudjelovanje u utrkama ili testiranjima, vuču drugih vozila, ili bilo koju drugu svrhu suprotnu njegovoj namjeni.

3. Stanje vozila i primopredaja
Najmoprimac potvrđuje da je vozilo preuzeo u ispravnom stanju, bez vidljivih oštećenja osim onih izričito navedenih u primopredajnom zapisniku i pripadajućim fotografijama. Najmoprimac je dužan vratiti vozilo u istom stanju, uz uobičajeno trošenje, na dogovorenom mjestu i u dogovoreno vrijeme.

4. Gorivo
Vozilo se predaje s određenom količinom goriva i mora se vratiti s istom količinom, osim ako je drugačije dogovoreno. U protivnom, najmodavac zadržava pravo naplate razlike goriva uvećane za trošak usluge točenja.

5. Odgovornost za štetu
Najmoprimac odgovara za svu štetu nastalu na vozilu tijekom trajanja najma, do iznosa učešća u šteti navedenog u ugovoru, osim ako je šteta nastala krivnjom treće strane uz uredno prijavljen policijski zapisnik. U slučaju prometne nezgode, najmoprimac je obavezan odmah obavijestiti policiju i najmodavca.

6. Produženje najma
Svako produženje razdoblja najma mora biti unaprijed dogovoreno s najmodavcem i potvrđeno pisanim putem (aneksom ugovora). Neovlašteno zadržavanje vozila nakon isteka ugovorenog razdoblja smatra se kršenjem ugovora.

7. Obrada osobnih podataka
Najmodavac obrađuje osobne podatke najmoprimca isključivo u svrhu izvršenja ovog ugovora, sukladno važećim propisima o zaštiti osobnih podataka, te ih ne ustupa trećim stranama osim kada je to zakonski obvezno.

8. Završne odredbe
Za sve što nije uređeno ovim uvjetima primjenjuju se odredbe Zakona o obveznim odnosima i drugih važećih propisa Republike Hrvatske. Eventualni sporovi rješavaju se sporazumno, a u slučaju spora nadležan je sud prema sjedištu najmodavca.`;

type Step = "documents" | "photos" | "terms" | "signature" | "review";
const STEPS: Step[] = ["documents", "photos", "terms", "signature", "review"];

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

  const [step, setStep] = useState<Step>("documents");

  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
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

  async function handleAngleFileChange(angle: PhotoAngle, rawFile: File | null) {
    const file = rawFile ? await compressImageFile(rawFile) : null;
    setAngles((prev) => ({
      ...prev,
      [angle]: { ...replaceFilePreview(prev[angle], file), damageDescription: prev[angle].damageDescription },
    }));
  }

  function handleAngleDamageChange(angle: PhotoAngle, value: string) {
    setAngles((prev) => ({ ...prev, [angle]: { ...prev[angle], damageDescription: value } }));
  }

  function addDamageEntry() {
    setDamages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), part: "", file: null, previewUrl: null, description: "" },
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

  const documentsComplete = Boolean(driverLicense.file && idDocument.file && phone.trim());
  const damagesComplete = damages.every((d) => d.part && d.file);
  const photosComplete = REQUIRED_ANGLES.every((angle) => angles[angle].file) && damagesComplete;

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
    if (!termsAccepted) {
      setSubmitError("Uvjeti najma moraju biti prihvaćeni.");
      return;
    }
    if (!signatureDataUrl) {
      setSubmitError("Potpis je obavezan.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    const formData = new FormData();
    formData.append("phone", phone.trim());
    if (address.trim()) formData.append("address", address.trim());
    formData.append("termsAccepted", "true");
    formData.append("termsVersion", TERMS_VERSION);
    formData.append("driverLicense", driverLicense.file);
    formData.append("idDocument", idDocument.file);
    REQUIRED_ANGLES.forEach((angle) => {
      const slot = angles[angle];
      if (slot.file) formData.append(`photo_${angle}`, slot.file);
      if (slot.damageDescription.trim()) {
        formData.append(`damage_${angle}`, slot.damageDescription.trim());
      }
    });
    formData.append("damageCount", String(damages.length));
    damages.forEach((d, i) => {
      if (!d.part || !d.file) return;
      formData.append(`damage_${i}_part`, d.part);
      formData.append(`damage_${i}_photo`, d.file);
      if (d.description.trim()) formData.append(`damage_${i}_description`, d.description.trim());
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
                Adresa (opcionalno)
                <input value={address} onChange={(e) => setAddress(e.target.value)} />
              </label>
              <label>
                Vozačka dozvola (slika)
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const raw = e.target.files?.[0] ?? null;
                    const file = raw ? await compressImageFile(raw) : null;
                    setDriverLicense((prev) => replaceFilePreview(prev, file));
                  }}
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
                  onChange={async (e) => {
                    const raw = e.target.files?.[0] ?? null;
                    const file = raw ? await compressImageFile(raw) : null;
                    setIdDocument((prev) => replaceFilePreview(prev, file));
                  }}
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
              {TERMS_TEXT.split("\n\n").map((paragraph, i) => (
                <p key={i} style={{ marginBottom: "0.75rem", whiteSpace: "pre-line" }}>
                  {paragraph}
                </p>
              ))}
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
