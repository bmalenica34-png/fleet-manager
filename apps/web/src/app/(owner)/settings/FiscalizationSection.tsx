"use client";

import { useEffect, useRef, useState } from "react";
import type { CompanySettingsDTO } from "@rent-a-car/api/server";
import { formatDateTimeHr } from "@rent-a-car/api";

export default function FiscalizationSection() {
  const [settings, setSettings] = useState<CompanySettingsDTO | null>(null);
  const [loading, setLoading] = useState(true);

  const [vatRegistered, setVatRegistered] = useState(true);
  const [finaOib, setFinaOib] = useState("");
  const [premiseLabel, setPremiseLabel] = useState("1");
  const [deviceLabel, setDeviceLabel] = useState("1");
  const [street, setStreet] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [workHours, setWorkHours] = useState("Pon-Pet 08:00-16:00");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [certPassword, setCertPassword] = useState("");
  const certFileRef = useRef<HTMLInputElement>(null);
  const [certUploading, setCertUploading] = useState(false);
  const [certMsg, setCertMsg] = useState<string | null>(null);

  const [registering, setRegistering] = useState(false);
  const [registerMsg, setRegisterMsg] = useState<string | null>(null);

  function applySettings(data: CompanySettingsDTO) {
    setSettings(data);
    setVatRegistered(data.vatRegistered);
    setFinaOib(data.finaOib ?? "");
    setPremiseLabel(data.finaPremiseLabel ?? "1");
    setDeviceLabel(data.finaDeviceLabel ?? "1");
    setStreet(data.finaPremiseStreet ?? "");
    setHouseNumber(data.finaPremiseHouseNumber ?? "");
    setCity(data.finaPremiseCity ?? "");
    setPostalCode(data.finaPremisePostalCode ?? "");
    setWorkHours(data.finaPremiseWorkHours ?? "Pon-Pet 08:00-16:00");
  }

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data: CompanySettingsDTO) => {
        applySettings(data);
        setLoading(false);
      });
  }, []);

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    if (finaOib && !/^\d{11}$/.test(finaOib)) {
      setError("FINA OIB mora imati 11 znamenki.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vatRegistered,
        finaOib: finaOib || undefined,
        finaPremiseLabel: premiseLabel || undefined,
        finaDeviceLabel: deviceLabel || undefined,
        finaPremiseStreet: street || undefined,
        finaPremiseHouseNumber: houseNumber || undefined,
        finaPremiseCity: city || undefined,
        finaPremisePostalCode: postalCode || undefined,
        finaPremiseWorkHours: workHours || undefined,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Greška prilikom spremanja postavki fiskalizacije.");
      return;
    }
    applySettings(await res.json());
    setSaved(true);
  }

  async function handleCertUpload() {
    const file = certFileRef.current?.files?.[0];
    if (!file) {
      setCertMsg("Odaberi .p12 / .pfx datoteku.");
      return;
    }
    setCertUploading(true);
    setCertMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("password", certPassword);
    const res = await fetch("/api/settings/fina-cert", { method: "POST", body: fd });
    setCertUploading(false);
    if (!res.ok) {
      setCertMsg("Upload certifikata nije uspio.");
      return;
    }
    applySettings(await res.json());
    setCertPassword("");
    if (certFileRef.current) certFileRef.current.value = "";
    setCertMsg("Certifikat spremljen.");
  }

  async function handleRegisterPremise() {
    setRegistering(true);
    setRegisterMsg(null);
    const res = await fetch("/api/fiscalization/register-premise", { method: "POST" });
    setRegistering(false);
    const body = await res.json();
    if (!res.ok) {
      setRegisterMsg(body?.error ?? "Registracija poslovnog prostora nije uspjela.");
      return;
    }
    applySettings(body);
    setRegisterMsg("Poslovni prostor registriran kod CIS-a.");
  }

  if (loading) return <p className="muted">Učitavanje...</p>;

  return (
    <div style={{ marginTop: "2rem", padding: "1rem", border: "1px solid var(--border, #ddd)", borderRadius: "8px" }}>
      <h2 style={{ marginTop: 0 }}>Fiskalizacija (R1 / R2 računi)</h2>
      <p className="muted" style={{ margin: "0.25rem 0 1rem" }}>
        PROBNA faza — koristi se FINA <strong>testni</strong> certifikat i cistest CIS okolina.
        Računi se izdaju iz &ldquo;Najmovi&rdquo; (klik &ldquo;Plaćeno&rdquo; → &ldquo;Izdati
        račun?&rdquo;).
      </p>

      <form onSubmit={handleSave}>
        <label style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
          <input
            type="checkbox"
            checked={vatRegistered}
            onChange={(e) => setVatRegistered(e.target.checked)}
            style={{ width: "auto" }}
          />
          Tvrtka je u sustavu PDV-a (25%)
        </label>

        <label>
          FINA OIB (OIB na koji je registriran certifikat)
          <input value={finaOib} onChange={(e) => setFinaOib(e.target.value)} maxLength={11} placeholder="11 znamenki" />
        </label>

        <div style={{ display: "flex", gap: "1rem" }}>
          <label style={{ flex: 1 }}>
            Oznaka poslovnog prostora
            <input value={premiseLabel} onChange={(e) => setPremiseLabel(e.target.value)} />
          </label>
          <label style={{ flex: 1 }}>
            Oznaka naplatnog uređaja
            <input value={deviceLabel} onChange={(e) => setDeviceLabel(e.target.value)} />
          </label>
        </div>

        <h3 style={{ marginBottom: "0.25rem" }}>Adresa poslovnog prostora</h3>
        <div style={{ display: "flex", gap: "1rem" }}>
          <label style={{ flex: 2 }}>
            Ulica
            <input value={street} onChange={(e) => setStreet(e.target.value)} />
          </label>
          <label style={{ flex: 1 }}>
            Kućni broj
            <input value={houseNumber} onChange={(e) => setHouseNumber(e.target.value)} />
          </label>
        </div>
        <div style={{ display: "flex", gap: "1rem" }}>
          <label style={{ flex: 1 }}>
            Poštanski broj
            <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
          </label>
          <label style={{ flex: 2 }}>
            Naselje / grad
            <input value={city} onChange={(e) => setCity(e.target.value)} />
          </label>
        </div>
        <label>
          Radno vrijeme
          <input value={workHours} onChange={(e) => setWorkHours(e.target.value)} />
        </label>

        {error && <p className="error">{error}</p>}
        {saved && <p className="muted">Spremljeno.</p>}
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? "Spremanje..." : "Spremi postavke fiskalizacije"}
        </button>
      </form>

      <hr style={{ margin: "1.5rem 0" }} />

      <h3 style={{ marginTop: 0 }}>FINA certifikat</h3>
      <p className="muted" style={{ margin: "0.25rem 0 0.5rem" }}>
        Status: {settings?.hasFinaCert ? "✓ certifikat postavljen" : "nije postavljen"}
      </p>
      <label>
        Certifikat (.p12 / .pfx)
        <input ref={certFileRef} type="file" accept=".p12,.pfx" />
      </label>
      <label>
        Zaporka certifikata
        <input type="password" value={certPassword} onChange={(e) => setCertPassword(e.target.value)} />
      </label>
      {certMsg && <p className="muted">{certMsg}</p>}
      <button className="btn" type="button" onClick={handleCertUpload} disabled={certUploading}>
        {certUploading ? "Upload..." : "Spremi certifikat"}
      </button>

      <hr style={{ margin: "1.5rem 0" }} />

      <h3 style={{ marginTop: 0 }}>Poslovni prostor kod CIS-a</h3>
      <p className="muted" style={{ margin: "0.25rem 0 0.5rem" }}>
        {settings?.finaPremiseRegisteredAt
          ? `✓ registriran ${formatDateTimeHr(settings.finaPremiseRegisteredAt)}`
          : "nije registriran"}
        {" — "}
        NIJE preduvjet za izdavanje računa (račun se fiskalizira i bez toga).
        Prijava radnog vremena po novom modelu (Fiskalizacija 2.0) još nije
        implementirana; ovaj gumb koristi stari model i može javiti grešku.
      </p>
      {registerMsg && <p className="muted">{registerMsg}</p>}
      <button
        className="btn"
        type="button"
        onClick={handleRegisterPremise}
        disabled={registering || !settings?.hasFinaCert}
      >
        {registering ? "Registracija..." : "Registriraj poslovni prostor (stari model)"}
      </button>
    </div>
  );
}
