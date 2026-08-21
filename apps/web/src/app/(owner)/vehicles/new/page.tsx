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

  // OCR prefill - skenira prometnu PRIJE spremanja vozila (vozilo još ne
  // postoji, pa se prometna ovdje ne uploada na Hetzner, samo šalje na
  // ekstrakciju). Vlasnik i dalje mora sam kliknuti "Spremi vozilo" i može
  // ispraviti bilo koje pogrešno prepoznato polje prije toga.
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrNotice, setOcrNotice] = useState<string | null>(null);

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

    const formData = new FormData(event.currentTarget);
    const registrationExpiresAt = formData.get("registrationExpiresAt");

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

  async function handleOcrScan() {
    if (!ocrFile) return;
    setOcrLoading(true);
    setOcrError(null);
    setOcrNotice(null);

    const formData = new FormData();
    formData.append("file", ocrFile);
    const res = await fetch("/api/ocr/registration-doc", { method: "POST", body: formData });

    setOcrLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setOcrError(
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
    if (result.licensePlate) {
      setLicensePlate(result.licensePlate);
      foundFields.push("tablice");
    }
    if (result.vin) {
      setVin(result.vin);
      foundFields.push("VIN");
    }

    setOcrNotice(
      foundFields.length > 0
        ? `Prepoznato: ${foundFields.join(", ")}. Provjeri polja prije spremanja.`
        : "Nije prepoznato nijedno polje - upiši ručno."
    );
  }

  return (
    <div>
      <h1>Novo vozilo</h1>

      <div style={{ marginBottom: "1.5rem", padding: "1rem", border: "1px solid var(--border, #ddd)", borderRadius: "8px" }}>
        <label>
          Skeniraj prometnu (OCR, opcionalno)
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              setOcrFile(e.target.files?.[0] ?? null);
              setOcrError(null);
              setOcrNotice(null);
            }}
            disabled={ocrLoading}
          />
        </label>
        {ocrFile && (
          <button type="button" className="btn" onClick={handleOcrScan} disabled={ocrLoading} style={{ marginTop: "0.5rem" }}>
            {ocrLoading ? "Skeniranje..." : "Skeniraj i prefilaj polja"}
          </button>
        )}
        {ocrError && <p className="error">{ocrError}</p>}
        {ocrNotice && <p className="muted">{ocrNotice}</p>}
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
          <input name="registrationExpiresAt" type="date" />
        </label>

        {error && <p className="error">{error}</p>}

        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Spremanje..." : "Spremi vozilo"}
        </button>
      </form>
    </div>
  );
}
