"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { OTHER_VEHICLE_OPTION, VEHICLE_MAKES, VEHICLE_MODELS_BY_MAKE } from "@rent-a-car/api";

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: CURRENT_YEAR + 1 - 1980 + 1 }, (_, i) => CURRENT_YEAR + 1 - i);

export default function NewVehiclePage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [make, setMake] = useState("");
  const [customMake, setCustomMake] = useState("");
  const [model, setModel] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [year, setYear] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [vin, setVin] = useState("");
  const [registrationExpiresAt, setRegistrationExpiresAt] = useState("");

  // OCR prefill - skenira prometnu PRIJE spremanja vozila (vozilo još ne
  // postoji, pa se ovdje ništa ne uploada na Hetzner, samo šalje na
  // ekstrakciju). Vlasnik i dalje mora sam kliknuti "Spremi vozilo" i može
  // ispraviti bilo koje pogrešno prepoznato polje prije toga. Dva odvojena
  // slota jer prometna ima dvije strane s različitim podacima - vanjska
  // (tablice, veliko i jasno prikazane) i unutarnja (tablica s markom/
  // modelom/VIN-om).
  const [outerOcrFile, setOuterOcrFile] = useState<File | null>(null);
  const [outerOcrLoading, setOuterOcrLoading] = useState(false);
  const [outerOcrError, setOuterOcrError] = useState<string | null>(null);
  const [outerOcrNotice, setOuterOcrNotice] = useState<string | null>(null);

  const [innerOcrFile, setInnerOcrFile] = useState<File | null>(null);
  const [innerOcrLoading, setInnerOcrLoading] = useState(false);
  const [innerOcrError, setInnerOcrError] = useState<string | null>(null);
  const [innerOcrNotice, setInnerOcrNotice] = useState<string | null>(null);

  // Polica osiguranja - PDF text-parsing (ne Vision OCR), isti endpoint kao
  // edit ekran. Vozilo još ne postoji pa se ovdje ništa ne uploada trajno,
  // samo prefila datum isteka registracije (procjena iz isteka osiguranja)/
  // tablice/VIN - stvaran upload police ide na edit ekranu nakon spremanja.
  const [insuranceOcrFile, setInsuranceOcrFile] = useState<File | null>(null);
  const [insuranceOcrLoading, setInsuranceOcrLoading] = useState(false);
  const [insuranceOcrError, setInsuranceOcrError] = useState<string | null>(null);
  const [insuranceOcrNotice, setInsuranceOcrNotice] = useState<string | null>(null);

  const isCustomMake = make === OTHER_VEHICLE_OPTION;
  const isCustomModel = isCustomMake || model === OTHER_VEHICLE_OPTION;
  const modelOptions = isCustomMake ? [] : (VEHICLE_MODELS_BY_MAKE[make] ?? []);

  function handleMakeChange(value: string) {
    setMake(value);
    // Popis modela ovisi o marki - promjena marke poništava prije odabrani
    // model (stari model vjerojatno ne postoji za novu marku).
    setModel("");
    setCustomModel("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const resolvedMake = isCustomMake ? customMake.trim() : make;
    const resolvedModel = isCustomModel ? customModel.trim() : model;
    if (!resolvedMake || !resolvedModel) {
      setError("Odaberi ili upiši marku i model.");
      return;
    }

    setSubmitting(true);

    const payload = {
      make: resolvedMake,
      model: resolvedModel,
      year: year ? Number(year) : undefined,
      licensePlate,
      vin: vin || undefined,
      registrationExpiresAt: registrationExpiresAt || undefined,
    };

    const res = await fetch("/api/vehicles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSubmitting(false);

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error === "validation_error" ? "Provjeri unesene podatke." : "Greška prilikom spremanja.");
      return;
    }

    const vehicle = await res.json();
    router.push(`/vehicles/${vehicle.id}`);
  }

  async function handleOuterOcrScan() {
    if (!outerOcrFile) return;
    setOuterOcrLoading(true);
    setOuterOcrError(null);
    setOuterOcrNotice(null);

    const formData = new FormData();
    formData.append("file", outerOcrFile);
    const res = await fetch("/api/ocr/registration-doc-outer", { method: "POST", body: formData });

    setOuterOcrLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setOuterOcrError(
        body?.error === "pdf_not_supported"
          ? "OCR trenutno podržava samo slike (fotografiraj prometnu umjesto PDF-a)."
          : "Skeniranje nije uspjelo. Podatke možeš upisati ručno."
      );
      return;
    }

    const result = await res.json();
    if (result.licensePlate) {
      setLicensePlate(result.licensePlate);
      setOuterOcrNotice("Prepoznato: tablice. Provjeri prije spremanja.");
    } else {
      setOuterOcrNotice("Tablice nisu prepoznate - upiši ručno.");
    }
  }

  async function handleInnerOcrScan() {
    if (!innerOcrFile) return;
    setInnerOcrLoading(true);
    setInnerOcrError(null);
    setInnerOcrNotice(null);

    const formData = new FormData();
    formData.append("file", innerOcrFile);
    const res = await fetch("/api/ocr/registration-doc-inner", { method: "POST", body: formData });

    setInnerOcrLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setInnerOcrError(
        body?.error === "pdf_not_supported"
          ? "OCR trenutno podržava samo slike (fotografiraj prometnu umjesto PDF-a)."
          : "Skeniranje nije uspjelo. Podatke možeš upisati ručno."
      );
      return;
    }

    const result = await res.json();
    const foundFields: string[] = [];

    if (result.make) {
      if (VEHICLE_MAKES.includes(result.make)) {
        setMake(result.make);
        setModel("");
        setCustomModel("");
      } else {
        setMake(OTHER_VEHICLE_OPTION);
        setCustomMake(result.make);
      }
      foundFields.push("marka");
    }
    if (result.model) {
      const models = VEHICLE_MODELS_BY_MAKE[result.make ?? make] ?? [];
      if (models.includes(result.model)) {
        setModel(result.model);
      } else {
        setModel(OTHER_VEHICLE_OPTION);
        setCustomModel(result.model);
      }
      foundFields.push("model");
    }
    if (result.vin) {
      setVin(result.vin);
      foundFields.push("VIN");
    }

    setInnerOcrNotice(
      foundFields.length > 0
        ? `Prepoznato: ${foundFields.join(", ")}. Provjeri polja prije spremanja.`
        : "Nije prepoznato nijedno polje - upiši ručno."
    );
  }

  async function handleInsuranceOcrScan() {
    if (!insuranceOcrFile) return;
    setInsuranceOcrLoading(true);
    setInsuranceOcrError(null);
    setInsuranceOcrNotice(null);

    const formData = new FormData();
    formData.append("file", insuranceOcrFile);
    const res = await fetch("/api/ocr/insurance-policy", { method: "POST", body: formData });

    setInsuranceOcrLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setInsuranceOcrError(
        body?.error === "pdf_required"
          ? "Ekstrakcija radi samo na PDF polici (ne na fotografiji/slici)."
          : "Ekstrakcija nije uspjela. Podatke možeš upisati ručno."
      );
      return;
    }

    const result = await res.json();
    const foundFields: string[] = [];

    if (result.registrationExpiresAt) {
      setRegistrationExpiresAt(result.registrationExpiresAt);
      foundFields.push("istek osiguranja");
    }
    if (result.licensePlate) {
      setLicensePlate(result.licensePlate);
      foundFields.push("tablice");
    }
    if (result.vin) {
      setVin(result.vin);
      foundFields.push("VIN");
    }

    setInsuranceOcrNotice(
      foundFields.length > 0
        ? `Prepoznato: ${foundFields.join(", ")}. Napomena: datum isteka registracije je pretpostavljen iz isteka osiguranja (obično se poklapaju, ali provjeri). Provjeri prije spremanja.`
        : "Ništa nije prepoznato - upiši ručno."
    );
  }

  return (
    <div>
      <h1>Novo vozilo</h1>

      <div style={{ marginBottom: "1.5rem", padding: "1rem", border: "1px solid var(--border, #ddd)", borderRadius: "8px" }}>
        <label>
          Skeniraj vanjsku stranu prometne (OCR, opcionalno)
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              setOuterOcrFile(e.target.files?.[0] ?? null);
              setOuterOcrError(null);
              setOuterOcrNotice(null);
            }}
            disabled={outerOcrLoading}
          />
        </label>
        <p className="muted" style={{ margin: "0.25rem 0" }}>→ registracija (tablice)</p>
        {outerOcrFile && (
          <button type="button" className="btn" onClick={handleOuterOcrScan} disabled={outerOcrLoading} style={{ marginTop: "0.5rem" }}>
            {outerOcrLoading ? "Skeniranje..." : "Skeniraj i prefilaj"}
          </button>
        )}
        {outerOcrError && <p className="error">{outerOcrError}</p>}
        {outerOcrNotice && <p className="muted">{outerOcrNotice}</p>}
      </div>

      <div style={{ marginBottom: "1.5rem", padding: "1rem", border: "1px solid var(--border, #ddd)", borderRadius: "8px" }}>
        <label>
          Skeniraj unutarnju stranu prometne (OCR, opcionalno)
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              setInnerOcrFile(e.target.files?.[0] ?? null);
              setInnerOcrError(null);
              setInnerOcrNotice(null);
            }}
            disabled={innerOcrLoading}
          />
        </label>
        <p className="muted" style={{ margin: "0.25rem 0" }}>→ marka/model/VIN</p>
        {innerOcrFile && (
          <button type="button" className="btn" onClick={handleInnerOcrScan} disabled={innerOcrLoading} style={{ marginTop: "0.5rem" }}>
            {innerOcrLoading ? "Skeniranje..." : "Skeniraj i prefilaj"}
          </button>
        )}
        {innerOcrError && <p className="error">{innerOcrError}</p>}
        {innerOcrNotice && <p className="muted">{innerOcrNotice}</p>}
      </div>

      <div style={{ marginBottom: "1.5rem", padding: "1rem", border: "1px solid var(--border, #ddd)", borderRadius: "8px" }}>
        <label>
          Skeniraj policu osiguranja (OCR, opcionalno, PDF)
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => {
              setInsuranceOcrFile(e.target.files?.[0] ?? null);
              setInsuranceOcrError(null);
              setInsuranceOcrNotice(null);
            }}
            disabled={insuranceOcrLoading}
          />
        </label>
        <p className="muted" style={{ margin: "0.25rem 0" }}>→ istek osiguranja (procjena isteka registracije), tablice, VIN</p>
        {insuranceOcrFile && (
          <button type="button" className="btn" onClick={handleInsuranceOcrScan} disabled={insuranceOcrLoading} style={{ marginTop: "0.5rem" }}>
            {insuranceOcrLoading ? "Skeniranje..." : "Skeniraj i prefilaj"}
          </button>
        )}
        {insuranceOcrError && <p className="error">{insuranceOcrError}</p>}
        {insuranceOcrNotice && <p className="muted">{insuranceOcrNotice}</p>}
      </div>

      <form onSubmit={handleSubmit}>
        <label>
          Marka
          <select value={make} onChange={(e) => handleMakeChange(e.target.value)} required>
            <option value="" disabled>
              Odaberi marku
            </option>
            {VEHICLE_MAKES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            <option value={OTHER_VEHICLE_OPTION}>{OTHER_VEHICLE_OPTION}</option>
          </select>
        </label>
        {isCustomMake && (
          <label>
            Upiši marku
            <input value={customMake} onChange={(e) => setCustomMake(e.target.value)} required />
          </label>
        )}

        <label>
          Model
          {isCustomModel ? (
            <input value={customModel} onChange={(e) => setCustomModel(e.target.value)} required />
          ) : (
            <select value={model} onChange={(e) => setModel(e.target.value)} required disabled={!make}>
              <option value="" disabled>
                Odaberi model
              </option>
              {modelOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
              <option value={OTHER_VEHICLE_OPTION}>{OTHER_VEHICLE_OPTION}</option>
            </select>
          )}
        </label>

        <label>
          Godina
          <select value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">Nepoznato</option>
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label>
          Registarske tablice
          <input name="licensePlate" value={licensePlate} onChange={(e) => setLicensePlate(e.target.value)} required />
        </label>
        <label>
          VIN
          <input name="vin" value={vin} onChange={(e) => setVin(e.target.value)} />
        </label>
        <label>
          Datum isteka registracije
          <input
            name="registrationExpiresAt"
            type="date"
            value={registrationExpiresAt}
            onChange={(e) => setRegistrationExpiresAt(e.target.value)}
          />
        </label>

        {error && <p className="error">{error}</p>}

        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Spremanje..." : "Spremi vozilo"}
        </button>
      </form>
    </div>
  );
}
