"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { VehicleDTO } from "@rent-a-car/api/server";

interface StagedImage {
  id: string;
  file: File;
  previewUrl: string;
}

export default function VehicleDetailPage() {
  const params = useParams<{ id: string }>();
  const vehicleId = params.id;

  const [vehicle, setVehicle] = useState<VehicleDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingInfo, setSavingInfo] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setSavingInfo(true);

    const formData = new FormData(event.currentTarget);
    const year = formData.get("year");
    const registrationExpiresAt = formData.get("registrationExpiresAt");
    const payload = {
      make: formData.get("make"),
      model: formData.get("model"),
      year: year ? Number(year) : undefined,
      licensePlate: formData.get("licensePlate"),
      vin: formData.get("vin") || undefined,
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

  if (loading) return <p className="muted">Učitavanje...</p>;
  if (!vehicle) return <p className="error">Vozilo nije pronađeno.</p>;

  return (
    <div>
      <h1>
        {vehicle.make} {vehicle.model}
      </h1>

      <form onSubmit={handleInfoSubmit}>
        <label>
          Marka
          <input name="make" defaultValue={vehicle.make} required />
        </label>
        <label>
          Model
          <input name="model" defaultValue={vehicle.model} required />
        </label>
        <label>
          Godina
          <input name="year" type="number" min={1950} defaultValue={vehicle.year ?? ""} />
        </label>
        <label>
          Registarske tablice
          <input name="licensePlate" defaultValue={vehicle.licensePlate} required />
        </label>
        <label>
          VIN
          <input name="vin" defaultValue={vehicle.vin ?? ""} />
        </label>
        <label>
          Datum isteka registracije
          <input
            name="registrationExpiresAt"
            type="date"
            defaultValue={
              vehicle.registrationExpiresAt
                ? new Date(vehicle.registrationExpiresAt).toISOString().slice(0, 10)
                : ""
            }
          />
        </label>

        {error && <p className="error">{error}</p>}

        <button className="btn btn-primary" type="submit" disabled={savingInfo}>
          {savingInfo ? "Spremanje..." : "Spremi promjene"}
        </button>
      </form>

      <h2 style={{ marginTop: "2rem" }}>Prometna</h2>
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
        <button className="btn btn-primary" onClick={handleSaveDoc} disabled={uploadingDoc} style={{ marginLeft: "0.5rem" }}>
          {uploadingDoc ? "Spremanje..." : "Spremi prometnu"}
        </button>
      )}
      {docError && <p className="error">{docError}</p>}

      <h2 style={{ marginTop: "2rem" }}>Polica osiguranja</h2>
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
        <button
          className="btn btn-primary"
          onClick={handleSaveInsurance}
          disabled={uploadingInsurance}
          style={{ marginLeft: "0.5rem" }}
        >
          {uploadingInsurance ? "Spremanje..." : "Spremi policu"}
        </button>
      )}
      {insuranceError && <p className="error">{insuranceError}</p>}

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
    </div>
  );
}
