"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { VehicleDTO } from "@rent-a-car/api/server";
import { OTHER_VEHICLE_OPTION, VEHICLE_MAKES, VEHICLE_MODELS_BY_MAKE, formatDateHr } from "@rent-a-car/api";

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: CURRENT_YEAR + 1 - 1980 + 1 }, (_, i) => CURRENT_YEAR + 1 - i);

interface StagedImage {
  id: string;
  file: File;
  previewUrl: string;
}

interface VehicleContractItem {
  id: string;
  number: number;
  vehicleId: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  client: { firstName: string; lastName: string };
  contractPdfUrl: string | null;
}

type VehicleTab = "info" | "documents" | "images" | "service" | "contracts";

const TABS: { id: VehicleTab; label: string }[] = [
  { id: "info", label: "Podaci o vozilu" },
  { id: "documents", label: "Dokumenti" },
  { id: "images", label: "Slike vozila" },
  { id: "service", label: "Servisna knjižica" },
  { id: "contracts", label: "Ugovori" },
];

export default function VehicleDetailPage() {
  const params = useParams<{ id: string }>();
  const vehicleId = params.id;

  const [vehicle, setVehicle] = useState<VehicleDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingInfo, setSavingInfo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<VehicleTab>("info");
  const [contracts, setContracts] = useState<VehicleContractItem[]>([]);
  const [contractsLoading, setContractsLoading] = useState(true);
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");

  const [make, setMake] = useState("");
  const [customMake, setCustomMake] = useState("");
  const [model, setModel] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [year, setYear] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [vin, setVin] = useState("");
  const [registrationExpiresAt, setRegistrationExpiresAt] = useState("");

  // OCR prefill - unutarnja strana koristi već odabrani `docFile` (isti
  // file input kao za "Spremi prometnu"), samo šalje na ekstrakciju umjesto
  // na spremanje. Vanjska strana ima vlastiti, odvojeni file input (samo za
  // OCR, ništa se ne uploada trajno) jer to nije isti dokument kao onaj koji
  // se sprema kao "prometna". Vlasnik i dalje mora kliknuti "Spremi
  // promjene" na "Podaci o vozilu" kartici da prihvati prefilana polja.
  const [innerOcrLoading, setInnerOcrLoading] = useState(false);
  const [innerOcrError, setInnerOcrError] = useState<string | null>(null);
  const [innerOcrNotice, setInnerOcrNotice] = useState<string | null>(null);

  const [outerOcrFile, setOuterOcrFile] = useState<File | null>(null);
  const [outerOcrLoading, setOuterOcrLoading] = useState(false);
  const [outerOcrError, setOuterOcrError] = useState<string | null>(null);
  const [outerOcrNotice, setOuterOcrNotice] = useState<string | null>(null);

  // Prometna: file se drži u state-u i prikazuje kao preview dok korisnik
  // ne klikne "Spremi prometnu" - upload se ne šalje odmah na odabir.
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docPreviewUrl, setDocPreviewUrl] = useState<string | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  // Polica osiguranja - isti staged-preview obrazac kao prometna.
  const [insuranceFile, setInsuranceFile] = useState<File | null>(null);
  const [insurancePreviewUrl, setInsurancePreviewUrl] = useState<string | null>(null);
  const [uploadingInsurance, setUploadingInsurance] = useState(false);
  const [insuranceError, setInsuranceError] = useState<string | null>(null);

  // OCR prefill iz police - koristi već odabrani `insuranceFile` (isti file
  // input kao za "Spremi policu"), PDF text-parsing (ne Vision OCR - polica
  // je generirani dokument, ne fotografija) za datum isteka registracije.
  const [insuranceOcrLoading, setInsuranceOcrLoading] = useState(false);
  const [insuranceOcrError, setInsuranceOcrError] = useState<string | null>(null);
  const [insuranceOcrNotice, setInsuranceOcrNotice] = useState<string | null>(null);

  // Slike vozila: odabrani fajlovi se AKUMULIRAJU u array (svaki novi odabir
  // se dodaje postojećima, ne overwrita ih) i drže dok korisnik ne klikne
  // "Spremi slike".
  const [stagedImages, setStagedImages] = useState<StagedImage[]>([]);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [imagesError, setImagesError] = useState<string | null>(null);
  const stagedImagesRef = useRef<StagedImage[]>([]);

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/vehicles/${vehicleId}`);
    if (res.ok) setVehicle(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleId]);

  useEffect(() => {
    fetch("/api/contracts")
      .then((res) => res.json())
      .then(setContracts)
      .finally(() => setContractsLoading(false));
  }, []);

  const vehicleContracts = contracts.filter((c) => c.vehicleId === vehicleId);

  // Aktivan ugovor - status "signed" i danas je unutar dateFrom/dateTo.
  // Prikazan istaknuto iznad tabova (vidi JSX niže), ne zakopan u listi
  // povijesti u "Ugovori" tabu.
  const now = new Date();
  const activeContract = vehicleContracts.find(
    (c) => c.status === "signed" && new Date(c.dateFrom) <= now && new Date(c.dateTo) >= now
  );

  // Povijest, najnovije prvo (po dateFrom) + opcionalan date-range filter
  // (od/do) - filtrira po preklapanju razdoblja najma s odabranim rasponom,
  // ne po strogom "unutar" - prazna granica znači neograničeno.
  const sortedVehicleContracts = [...vehicleContracts].sort(
    (a, b) => new Date(b.dateFrom).getTime() - new Date(a.dateFrom).getTime()
  );
  const filteredVehicleContracts = sortedVehicleContracts.filter((c) => {
    if (historyFrom && new Date(c.dateTo) < new Date(historyFrom)) return false;
    if (historyTo && new Date(c.dateFrom) > new Date(historyTo)) return false;
    return true;
  });

  // Marka/model/godina su controlled selecti (za cascading model-popis i
  // "Ostalo" custom unos) - ostala polja i dalje idu kroz defaultValue +
  // FormData na submit, nepromijenjeno. Ako spremljena marka/model nisu na
  // statičkoj listi (stariji unos ili "Ostalo" iz prije), pada natrag na
  // custom tekstualni način umjesto da tiho izgubi vrijednost.
  useEffect(() => {
    if (!vehicle) return;
    if (VEHICLE_MAKES.includes(vehicle.make)) {
      setMake(vehicle.make);
      const models = VEHICLE_MODELS_BY_MAKE[vehicle.make] ?? [];
      if (models.includes(vehicle.model)) {
        setModel(vehicle.model);
        setCustomModel("");
      } else {
        setModel(OTHER_VEHICLE_OPTION);
        setCustomModel(vehicle.model);
      }
      setCustomMake("");
    } else {
      setMake(OTHER_VEHICLE_OPTION);
      setCustomMake(vehicle.make);
      setModel(OTHER_VEHICLE_OPTION);
      setCustomModel(vehicle.model);
    }
    setYear(vehicle.year ? String(vehicle.year) : "");
    setLicensePlate(vehicle.licensePlate);
    setVin(vehicle.vin ?? "");
    setRegistrationExpiresAt(
      vehicle.registrationExpiresAt ? new Date(vehicle.registrationExpiresAt).toISOString().slice(0, 10) : ""
    );
  }, [vehicle]);

  const isCustomMake = make === OTHER_VEHICLE_OPTION;
  const isCustomModel = isCustomMake || model === OTHER_VEHICLE_OPTION;
  const modelOptions = isCustomMake ? [] : (VEHICLE_MODELS_BY_MAKE[make] ?? []);

  function handleMakeChange(value: string) {
    setMake(value);
    setModel("");
    setCustomModel("");
  }

  // Preview za prometnu - generira se svaki put kad se docFile promijeni,
  // stari object URL se revoke-a da ne curi memorija.
  useEffect(() => {
    if (!docFile) {
      setDocPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(docFile);
    setDocPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [docFile]);

  useEffect(() => {
    if (!insuranceFile) {
      setInsurancePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(insuranceFile);
    setInsurancePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [insuranceFile]);

  // Držimo ref na zadnji stagedImages da cleanup-on-unmount ne gleda
  // zastarjeli (stale) closure.
  useEffect(() => {
    stagedImagesRef.current = stagedImages;
  }, [stagedImages]);

  useEffect(() => {
    return () => {
      stagedImagesRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, []);

  async function handleInfoSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const resolvedMake = isCustomMake ? customMake.trim() : make;
    const resolvedModel = isCustomModel ? customModel.trim() : model;
    if (!resolvedMake || !resolvedModel) {
      setError("Odaberi ili upiši marku i model.");
      return;
    }

    setSavingInfo(true);

    const payload = {
      make: resolvedMake,
      model: resolvedModel,
      year: year ? Number(year) : undefined,
      licensePlate,
      vin: vin || undefined,
      registrationExpiresAt: registrationExpiresAt || undefined,
    };

    const res = await fetch(`/api/vehicles/${vehicleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSavingInfo(false);
    if (!res.ok) {
      setError("Greška prilikom spremanja podataka o vozilu.");
      return;
    }
    setVehicle(await res.json());
  }

  function handleDocSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setDocError(null);
    setDocFile(file);
    // Siguran reset - File objekt je već uhvaćen u state-u iznad, pa
    // pražnjenje inputa ovdje ne briše preview.
    event.target.value = "";
  }

  async function handleSaveDoc() {
    if (!docFile) return;
    setUploadingDoc(true);
    setDocError(null);

    const formData = new FormData();
    formData.append("file", docFile);
    const res = await fetch(`/api/vehicles/${vehicleId}/registration-doc`, {
      method: "POST",
      body: formData,
    });

    setUploadingDoc(false);
    if (!res.ok) {
      setDocError("Greška prilikom uploada prometne. Pokušaj ponovno.");
      return;
    }
    setDocFile(null);
    load();
  }

  function handleInsuranceSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setInsuranceError(null);
    setInsuranceFile(file);
    event.target.value = "";
  }

  async function handleSaveInsurance() {
    if (!insuranceFile) return;
    setUploadingInsurance(true);
    setInsuranceError(null);

    const formData = new FormData();
    formData.append("file", insuranceFile);
    const res = await fetch(`/api/vehicles/${vehicleId}/insurance-policy`, {
      method: "POST",
      body: formData,
    });

    setUploadingInsurance(false);
    if (!res.ok) {
      setInsuranceError("Greška prilikom uploada police. Pokušaj ponovno.");
      return;
    }
    setInsuranceFile(null);
    load();
  }

  function handleImagesSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const newItems: StagedImage[] = Array.from(files).map((file) => ({
      id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2)}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    // Append, NE overwrite - svaki novi odabir dodaje slike postojećem setu.
    setStagedImages((prev) => [...prev, ...newItems]);
    setImagesError(null);
    // File objekti su već uhvaćeni u state-u (newItems), pa je pražnjenje
    // inputa ovdje sigurno i omogućuje ponovni odabir istog fajla kasnije.
    event.target.value = "";
  }

  function removeStagedImage(id: string) {
    setStagedImages((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  }

  async function handleSaveImages() {
    if (stagedImages.length === 0) return;
    setUploadingImages(true);
    setImagesError(null);

    const formData = new FormData();
    stagedImages.forEach((item) => formData.append("files", item.file));
    const res = await fetch(`/api/vehicles/${vehicleId}/images`, {
      method: "POST",
      body: formData,
    });

    setUploadingImages(false);
    if (!res.ok) {
      setImagesError("Greška prilikom uploada slika. Pokušaj ponovno.");
      return;
    }

    stagedImages.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    setStagedImages([]);
    load();
  }

  async function handleImageDelete(imageId: string) {
    await fetch(`/api/vehicles/${vehicleId}/images/${imageId}`, { method: "DELETE" });
    load();
  }

  async function handleInnerOcrScan() {
    if (!docFile) return;
    setInnerOcrLoading(true);
    setInnerOcrError(null);
    setInnerOcrNotice(null);

    const formData = new FormData();
    formData.append("file", docFile);
    const res = await fetch("/api/ocr/registration-doc-inner", { method: "POST", body: formData });

    setInnerOcrLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setInnerOcrError(
        body?.error === "pdf_not_supported"
          ? "OCR trenutno podržava samo slike (fotografiraj prometnu umjesto PDF-a)."
          : "Skeniranje nije uspjelo. Podatke možeš upisati ručno na kartici 'Podaci o vozilu'."
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
        ? `Prepoznato: ${foundFields.join(", ")}. Provjeri na kartici "Podaci o vozilu" i spremi.`
        : "Nije prepoznato nijedno polje - upiši ručno."
    );
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
          : "Skeniranje nije uspjelo. Podatke možeš upisati ručno na kartici 'Podaci o vozilu'."
      );
      return;
    }

    const result = await res.json();
    if (result.licensePlate) {
      setLicensePlate(result.licensePlate);
      setOuterOcrNotice('Prepoznato: tablice. Provjeri na kartici "Podaci o vozilu" i spremi.');
    } else {
      setOuterOcrNotice("Tablice nisu prepoznate - upiši ručno.");
    }
  }

  async function handleInsuranceOcrScan() {
    if (!insuranceFile) return;
    setInsuranceOcrLoading(true);
    setInsuranceOcrError(null);
    setInsuranceOcrNotice(null);

    const formData = new FormData();
    formData.append("file", insuranceFile);
    const res = await fetch("/api/ocr/insurance-policy", { method: "POST", body: formData });

    setInsuranceOcrLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setInsuranceOcrError(
        body?.error === "pdf_required"
          ? "Ekstrakcija radi samo na PDF polici (ne na fotografiji/slici)."
          : "Ekstrakcija nije uspjela. Datum možeš upisati ručno na kartici 'Podaci o vozilu'."
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
        ? `Prepoznato: ${foundFields.join(", ")}. Napomena: datum isteka registracije je pretpostavljen iz isteka osiguranja (obično se poklapaju, ali provjeri). Provjeri na kartici "Podaci o vozilu" i spremi.`
        : "Ništa nije prepoznato - upiši ručno."
    );
  }

  if (loading) return <p className="muted">Učitavanje...</p>;
  if (!vehicle) return <p className="error">Vozilo nije pronađeno.</p>;

  return (
    <div>
      <h1>
        {vehicle.make} {vehicle.model}
      </h1>

      {activeContract && (
        <div
          style={{
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            border: "1px solid #16a34a",
            borderRadius: "6px",
            background: "#f0fdf4",
            color: "#166534",
          }}
        >
          <strong>Aktivan ugovor br. {activeContract.number}</strong> - {activeContract.client.firstName}{" "}
          {activeContract.client.lastName}, {formatDateHr(activeContract.dateFrom)} –{" "}
          {formatDateHr(activeContract.dateTo)}
          {activeContract.contractPdfUrl && (
            <>
              {" "}
              (
              <a href={activeContract.contractPdfUrl} target="_blank" rel="noreferrer">
                PDF
              </a>
              )
            </>
          )}
        </div>
      )}

      <div className="toolbar" style={{ justifyContent: "flex-start", gap: "0.5rem" }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`btn${activeTab === tab.id ? " btn-primary" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "info" && (
      <form onSubmit={handleInfoSubmit}>
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

        <button className="btn btn-primary" type="submit" disabled={savingInfo}>
          {savingInfo ? "Spremanje..." : "Spremi promjene"}
        </button>
      </form>
      )}

      {activeTab === "documents" && (
      <>
      <h2 style={{ marginTop: "2rem" }}>Vanjska strana prometne (OCR)</h2>
      <p className="muted" style={{ margin: "0.25rem 0" }}>→ registracija (tablice)</p>
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
      {outerOcrFile && (
        <button className="btn" onClick={handleOuterOcrScan} disabled={outerOcrLoading} style={{ marginLeft: "0.5rem" }}>
          {outerOcrLoading ? "Skeniranje..." : "Skeniraj i prefilaj"}
        </button>
      )}
      {outerOcrError && <p className="error">{outerOcrError}</p>}
      {outerOcrNotice && <p className="muted">{outerOcrNotice}</p>}

      <h2 style={{ marginTop: "2rem" }}>Unutarnja strana prometne</h2>
      <p className="muted" style={{ margin: "0.25rem 0" }}>→ marka/model/VIN</p>
      {vehicle.registrationDocUrl && !docPreviewUrl && (
        <p>
          <a href={vehicle.registrationDocUrl} target="_blank" rel="noreferrer">
            Pregledaj trenutnu prometnu
          </a>
        </p>
      )}
      {!vehicle.registrationDocUrl && !docPreviewUrl && (
        <p className="muted">Prometna još nije uploadana.</p>
      )}

      {docPreviewUrl && (
        <div className="image-grid">
          <figure>
            <img src={docPreviewUrl} alt="Preview prometne" />
            <figcaption className="muted">{docFile?.name}</figcaption>
          </figure>
        </div>
      )}

      <input type="file" accept="image/*,.pdf" onChange={handleDocSelected} disabled={uploadingDoc} />
      {docFile && (
        <>
          <button className="btn btn-primary" onClick={handleSaveDoc} disabled={uploadingDoc} style={{ marginLeft: "0.5rem" }}>
            {uploadingDoc ? "Spremanje..." : "Spremi prometnu"}
          </button>
          <button className="btn" onClick={handleInnerOcrScan} disabled={innerOcrLoading} style={{ marginLeft: "0.5rem" }}>
            {innerOcrLoading ? "Skeniranje..." : "Skeniraj i prefilaj"}
          </button>
        </>
      )}
      {docError && <p className="error">{docError}</p>}
      {innerOcrError && <p className="error">{innerOcrError}</p>}
      {innerOcrNotice && <p className="muted">{innerOcrNotice}</p>}

      <h2 style={{ marginTop: "2rem" }}>Polica osiguranja</h2>
      <p className="muted" style={{ margin: "0.25rem 0" }}>→ istek osiguranja (procjena isteka registracije), tablice, VIN</p>
      {vehicle.insurancePolicyUrl && !insurancePreviewUrl && (
        <p>
          <a href={vehicle.insurancePolicyUrl} target="_blank" rel="noreferrer">
            Pregledaj trenutnu policu
          </a>
        </p>
      )}
      {!vehicle.insurancePolicyUrl && !insurancePreviewUrl && (
        <p className="muted">Polica osiguranja još nije uploadana.</p>
      )}

      {insurancePreviewUrl && (
        <div className="image-grid">
          <figure>
            <img src={insurancePreviewUrl} alt="Preview police osiguranja" />
            <figcaption className="muted">{insuranceFile?.name}</figcaption>
          </figure>
        </div>
      )}

      <input
        type="file"
        accept="image/*,.pdf"
        onChange={handleInsuranceSelected}
        disabled={uploadingInsurance}
      />
      {insuranceFile && (
        <>
          <button
            className="btn btn-primary"
            onClick={handleSaveInsurance}
            disabled={uploadingInsurance}
            style={{ marginLeft: "0.5rem" }}
          >
            {uploadingInsurance ? "Spremanje..." : "Spremi policu"}
          </button>
          <button
            className="btn"
            onClick={handleInsuranceOcrScan}
            disabled={insuranceOcrLoading}
            style={{ marginLeft: "0.5rem" }}
          >
            {insuranceOcrLoading ? "Skeniranje..." : "Skeniraj i prefilaj"}
          </button>
        </>
      )}
      {insuranceError && <p className="error">{insuranceError}</p>}
      {insuranceOcrError && <p className="error">{insuranceOcrError}</p>}
      {insuranceOcrNotice && <p className="muted">{insuranceOcrNotice}</p>}
      </>
      )}

      {activeTab === "images" && (
      <>
      <h2 style={{ marginTop: "2rem" }}>Slike vozila</h2>
      <div className="image-grid">
        {vehicle.images.map((image) => (
          <figure key={image.id}>
            <img src={image.url} alt="Slika vozila" />
            <button className="btn btn-danger" onClick={() => handleImageDelete(image.id)}>
              Obriši
            </button>
          </figure>
        ))}
      </div>

      {stagedImages.length > 0 && (
        <>
          <p className="muted">Odabrane slike (još nisu spremljene):</p>
          <div className="image-grid">
            {stagedImages.map((item) => (
              <figure key={item.id}>
                <img src={item.previewUrl} alt={item.file.name} />
                <button className="btn btn-danger" onClick={() => removeStagedImage(item.id)}>
                  Ukloni
                </button>
              </figure>
            ))}
          </div>
        </>
      )}

      <input type="file" accept="image/*" multiple onChange={handleImagesSelected} disabled={uploadingImages} />
      {stagedImages.length > 0 && (
        <button className="btn btn-primary" onClick={handleSaveImages} disabled={uploadingImages} style={{ marginLeft: "0.5rem" }}>
          {uploadingImages ? "Spremanje..." : `Spremi slike (${stagedImages.length})`}
        </button>
      )}
      {imagesError && <p className="error">{imagesError}</p>}
      </>
      )}

      {activeTab === "service" && (
        <p className="muted" style={{ marginTop: "2rem" }}>
          Servisna knjižica - uskoro. Puna funkcionalnost servisne povijesti (unos servisa, datumi,
          troškovi) dolazi u budućoj nadogradnji.
        </p>
      )}

      {activeTab === "contracts" && (
        <div style={{ marginTop: "2rem" }}>
          <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end", marginBottom: "1rem" }}>
            <label>
              Od
              <input type="date" value={historyFrom} onChange={(e) => setHistoryFrom(e.target.value)} />
            </label>
            <label>
              Do
              <input type="date" value={historyTo} onChange={(e) => setHistoryTo(e.target.value)} />
            </label>
            {(historyFrom || historyTo) && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setHistoryFrom("");
                  setHistoryTo("");
                }}
              >
                Poništi filter
              </button>
            )}
          </div>

          {contractsLoading ? (
            <p className="muted">Učitavanje...</p>
          ) : filteredVehicleContracts.length === 0 ? (
            <p className="muted">
              {vehicleContracts.length === 0 ? "Nema ugovora za ovo vozilo." : "Nema ugovora u odabranom razdoblju."}
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Broj</th>
                  <th>Od</th>
                  <th>Do</th>
                  <th>Status</th>
                  <th>Klijent</th>
                  <th>Dokument</th>
                </tr>
              </thead>
              <tbody>
                {filteredVehicleContracts.map((c) => (
                  <tr key={c.id}>
                    <td>{c.number}</td>
                    <td>{formatDateHr(c.dateFrom)}</td>
                    <td>{formatDateHr(c.dateTo)}</td>
                    <td>{c.status}</td>
                    <td>
                      {c.client.firstName} {c.client.lastName}
                    </td>
                    <td>
                      {c.contractPdfUrl ? (
                        <a href={c.contractPdfUrl} target="_blank" rel="noreferrer">
                          Preuzmi PDF
                        </a>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
