"use client";

import { useEffect, useState } from "react";
import type { CompanySettingsDTO } from "@rent-a-car/api/server";

export default function SettingsPage() {
  const [settings, setSettings] = useState<CompanySettingsDTO | null>(null);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [oib, setOib] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Logo: staged-preview obrazac (isti kao prometna/polica na vozilu) -
  // odabir generira lokalni preview odmah, stvaran upload tek na "Spremi
  // logo" klik.
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data: CompanySettingsDTO) => {
        setSettings(data);
        setName(data.name ?? "");
        setOib(data.oib ?? "");
        setAddress(data.address ?? "");
        setPhone(data.phone ?? "");
        setEmail(data.email ?? "");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(logoFile);
    setLogoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);

    const payload = {
      name: name || undefined,
      oib: oib || undefined,
      address: address || undefined,
      phone: phone || undefined,
      email: email || undefined,
    };

    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSaving(false);
    if (!res.ok) {
      setError("Greška prilikom spremanja podataka.");
      return;
    }
    setSettings(await res.json());
    setSaved(true);
  }

  function handleLogoSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setLogoError(null);
    setLogoFile(file);
    event.target.value = "";
  }

  async function handleSaveLogo() {
    if (!logoFile) return;
    setUploadingLogo(true);
    setLogoError(null);

    const formData = new FormData();
    formData.append("file", logoFile);
    const res = await fetch("/api/settings/logo", { method: "POST", body: formData });

    setUploadingLogo(false);
    if (!res.ok) {
      setLogoError("Greška prilikom uploada loga. Pokušaj ponovno.");
      return;
    }
    setSettings(await res.json());
    setLogoFile(null);
  }

  if (loading) return <p className="muted">Učitavanje...</p>;

  return (
    <div>
      <h1>Postavke</h1>

      <form onSubmit={handleSubmit}>
        <h2>Podaci o tvrtki</h2>
        <p className="muted" style={{ margin: "0.25rem 0 1rem" }}>
          Prikazuje se u zaglavlju i potpisnom bloku generiranih ugovora (PDF).
        </p>
        <label>
          Naziv tvrtke
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          OIB
          <input value={oib} onChange={(e) => setOib(e.target.value)} />
        </label>
        <label>
          Adresa
          <input value={address} onChange={(e) => setAddress(e.target.value)} />
        </label>
        <label>
          Telefon
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>

        {error && <p className="error">{error}</p>}
        {saved && <p className="muted">Spremljeno.</p>}

        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? "Spremanje..." : "Spremi podatke"}
        </button>
      </form>

      <div style={{ marginTop: "2rem", padding: "1rem", border: "1px solid var(--border, #ddd)", borderRadius: "8px" }}>
        <h2 style={{ marginTop: 0 }}>Logo tvrtke</h2>
        <p className="muted" style={{ margin: "0.25rem 0 1rem" }}>
          Prikazuje se u kutu zaglavlja generiranog ugovora (PDF).
        </p>

        {(logoPreviewUrl || settings?.logoUrl) && (
          <div className="image-grid">
            <figure>
              <img src={logoPreviewUrl ?? settings!.logoUrl!} alt="Preview loga" style={{ maxHeight: 120 }} />
              <figcaption className="muted">{logoFile ? logoFile.name : "Trenutni logo"}</figcaption>
            </figure>
          </div>
        )}
        {!logoPreviewUrl && !settings?.logoUrl && <p className="muted">Logo još nije uploadan.</p>}

        <input type="file" accept="image/*" onChange={handleLogoSelected} disabled={uploadingLogo} />
        {logoFile && (
          <button
            className="btn btn-primary"
            onClick={handleSaveLogo}
            disabled={uploadingLogo}
            style={{ marginLeft: "0.5rem" }}
          >
            {uploadingLogo ? "Spremanje..." : "Spremi logo"}
          </button>
        )}
        {logoError && <p className="error">{logoError}</p>}
      </div>

      <div style={{ marginTop: "2rem", padding: "1rem", border: "1px solid var(--border, #ddd)", borderRadius: "8px", opacity: 0.6 }}>
        <h2 style={{ marginTop: 0 }}>Digitalni certifikat</h2>
        <p className="muted" style={{ margin: 0 }}>
          Uskoro - kvalificirani/digitalni potpis kao zamjena za tekstualni potpisni blok na ugovoru.
        </p>
      </div>
    </div>
  );
}
