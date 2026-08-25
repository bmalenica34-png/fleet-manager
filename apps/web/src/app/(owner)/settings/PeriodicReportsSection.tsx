"use client";

import { useEffect, useState } from "react";
import type { CompanySettingsDTO } from "@rent-a-car/api/server";
import type { ReportFrequency } from "@rent-a-car/api";
import { formatDateTimeHr } from "@rent-a-car/api";

const FREQUENCY_LABELS: Record<ReportFrequency, string> = {
  off: "Isključeno",
  daily: "Dnevno",
  weekly: "Tjedno",
  monthly: "Mjesečno",
  custom: "Prilagođeno (svakih N dana)",
};

export default function PeriodicReportsSection() {
  const [settings, setSettings] = useState<CompanySettingsDTO | null>(null);
  const [loading, setLoading] = useState(true);

  const [frequency, setFrequency] = useState<ReportFrequency>("off");
  const [customDays, setCustomDays] = useState("7");
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data: CompanySettingsDTO) => {
        setSettings(data);
        setFrequency(data.reportFrequency);
        setCustomDays(data.reportCustomIntervalDays ? String(data.reportCustomIntervalDays) : "7");
        setEmailEnabled(data.reportEmailEnabled);
        setLoading(false);
      });
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    if (frequency === "custom" && (!customDays || Number(customDays) < 1)) {
      setError("Upiši valjan broj dana (minimalno 1) za prilagođeni interval.");
      return;
    }

    setSaving(true);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reportFrequency: frequency,
        reportCustomIntervalDays: frequency === "custom" ? Number(customDays) : undefined,
        reportEmailEnabled: emailEnabled,
      }),
    });

    setSaving(false);
    if (!res.ok) {
      setError("Greška prilikom spremanja postavki izvještaja.");
      return;
    }
    setSettings(await res.json());
    setSaved(true);
  }

  if (loading) return <p className="muted">Učitavanje...</p>;

  return (
    <div style={{ marginTop: "2rem", padding: "1rem", border: "1px solid var(--border, #ddd)", borderRadius: "8px" }}>
      <h2 style={{ marginTop: 0 }}>Periodični izvještaji</h2>
      <p className="muted" style={{ margin: "0.25rem 0 1rem" }}>
        Automatski izvještaj o profitabilnosti cijele flote (prihod, trošak servisa, profit, dani
        pod ugovorom) za razdoblje koje odgovara odabranoj učestalosti. Za pojedinačan izvještaj
        bilo kad, koristi &ldquo;Preuzmi PDF izvještaj&rdquo; na{" "}
        <a href="/">dashboardu</a>.
      </p>

      <form onSubmit={handleSubmit}>
        <label>
          Učestalost
          <select value={frequency} onChange={(e) => setFrequency(e.target.value as ReportFrequency)}>
            {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        {frequency === "custom" && (
          <label>
            Interval (broj dana)
            <input
              type="number"
              min={1}
              max={365}
              value={customDays}
              onChange={(e) => setCustomDays(e.target.value)}
            />
          </label>
        )}

        {frequency !== "off" && (
          <label style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="checkbox"
              checked={emailEnabled}
              onChange={(e) => setEmailEnabled(e.target.checked)}
              style={{ width: "auto" }}
            />
            Šalji izvještaj emailom (isti primatelj kao ostale notifikacije)
          </label>
        )}

        {settings?.lastReportSentAt && (
          <p className="muted" style={{ margin: "0.5rem 0" }}>
            Zadnji izvještaj poslan: {formatDateTimeHr(settings.lastReportSentAt)}
          </p>
        )}

        {error && <p className="error">{error}</p>}
        {saved && <p className="muted">Spremljeno.</p>}

        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? "Spremanje..." : "Spremi postavke izvještaja"}
        </button>
      </form>
    </div>
  );
}
