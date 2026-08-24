"use client";

import { useEffect, useState } from "react";
import { formatDateTimeHr } from "@rent-a-car/api";
import type { TermsAndConditionsDTO } from "@rent-a-car/api/server";

export default function TermsSection() {
  const [versions, setVersions] = useState<TermsAndConditionsDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function load() {
    fetch("/api/terms")
      .then((res) => res.json())
      .then((data: TermsAndConditionsDTO[]) => {
        setVersions(data);
        const active = data.find((t) => t.active);
        if (active) setContent(active.content);
        setLoading(false);
      });
  }

  useEffect(load, []);

  const active = versions.find((t) => t.active) ?? null;
  const contentUnchanged = active !== null && content === active.content;

  async function handleSaveNewVersion() {
    setError(null);
    setSaved(false);
    setSaving(true);

    const res = await fetch("/api/terms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    setSaving(false);
    if (!res.ok) {
      setError("Greška prilikom spremanja nove verzije.");
      return;
    }
    setSaved(true);
    load();
  }

  if (loading) return <p className="muted">Učitavanje...</p>;

  return (
    <div style={{ marginTop: "2rem", padding: "1rem", border: "1px solid var(--border, #ddd)", borderRadius: "8px" }}>
      <h2 style={{ marginTop: 0 }}>Uvjeti najma</h2>
      <p className="muted" style={{ margin: "0.25rem 0 1rem" }}>
        Trenutno aktivna verzija: <strong>{active ? active.version : "—"}</strong>
        {active && ` (od ${formatDateTimeHr(active.createdAt)})`}. Klijent vidi ovaj tekst u
        signing wizardu i prilaže se kao PDF uz svaki potpisan ugovor.
      </p>
      <p className="muted" style={{ margin: "0 0 1rem" }}>
        <strong>Spremanje nove verzije vrijedi samo za buduće ugovore</strong> - već potpisani
        ugovori zadržavaju PDF s tekstom koji je vrijedio u trenutku njihovog potpisa, stare
        verzije se nikad ne mijenjaju niti brišu.
      </p>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={16}
        style={{ width: "100%", fontFamily: "inherit", fontSize: "0.9rem" }}
      />
      <p className="muted" style={{ margin: "0.25rem 0" }}>
        Odlomci se odvajaju praznim retkom (jedan prazan red između odlomaka).
      </p>

      {error && <p className="error">{error}</p>}
      {saved && <p className="muted">Nova verzija spremljena i aktivna.</p>}

      <button
        className="btn btn-primary"
        onClick={handleSaveNewVersion}
        disabled={saving || !content.trim() || contentUnchanged}
      >
        {saving ? "Spremanje..." : "Spremi novu verziju"}
      </button>

      <h3 style={{ marginTop: "1.5rem" }}>Povijest verzija</h3>
      {versions.map((v) => (
        <div key={v.id} style={{ marginBottom: "0.5rem" }}>
          <button
            type="button"
            className="btn"
            onClick={() => setExpandedId(expandedId === v.id ? null : v.id)}
            style={{ marginRight: "0.5rem" }}
          >
            {expandedId === v.id ? "Sakrij" : "Prikaži"}
          </button>
          Verzija {v.version}
          {v.active && <strong> (aktivna)</strong>} - {formatDateTimeHr(v.createdAt)}
          {expandedId === v.id && (
            <pre
              style={{
                whiteSpace: "pre-wrap",
                marginTop: "0.5rem",
                padding: "0.75rem",
                border: "1px solid var(--border, #ddd)",
                borderRadius: "6px",
                fontFamily: "inherit",
                fontSize: "0.85rem",
              }}
            >
              {v.content}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}
