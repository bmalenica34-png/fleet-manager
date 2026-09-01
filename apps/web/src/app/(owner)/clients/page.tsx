"use client";

import { useEffect, useState } from "react";
import type { Client } from "@rent-a-car/api";

type ClientType = "fizicka" | "pravna";

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");

  // Forma "novi klijent"
  const [type, setType] = useState<ClientType>("fizicka");
  const [oib, setOib] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [lookupState, setLookupState] = useState<
    { status: "idle" | "loading" | "done"; message: string | null }
  >({ status: "idle", message: null });

  async function load() {
    setLoading(true);
    const res = await fetch("/api/clients");
    setClients(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleLookup() {
    if (!/^\d{11}$/.test(oib.trim())) {
      setLookupState({ status: "done", message: "OIB firme mora imati 11 znamenki." });
      return;
    }
    setLookupState({ status: "loading", message: null });
    try {
      const res = await fetch(`/api/sudreg/${oib.trim()}`);
      const data: { status: string; naziv: string | null; adresa: string | null } = await res.json();
      if (data.status === "pronadjen" && data.naziv) {
        setCompanyName(data.naziv);
        if (data.adresa) setCompanyAddress(data.adresa);
        setLookupState({ status: "done", message: "Podaci dohvaćeni iz sudskog registra." });
      } else if (data.status === "neispravan_oib") {
        setLookupState({ status: "done", message: "Neispravan OIB (kontrolna znamenka)." });
      } else {
        setLookupState({
          status: "done",
          message: "Nije pronađeno u sudskom registru — upiši podatke ručno.",
        });
      }
    } catch {
      setLookupState({
        status: "done",
        message: "Sudski registar trenutno nedostupan — upiši podatke ručno.",
      });
    }
  }

  function resetForm() {
    setType("fizicka");
    setOib("");
    setCompanyName("");
    setCompanyAddress("");
    setLookupState({ status: "idle", message: null });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const payload = {
      type,
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
      oib: (formData.get("oib") as string)?.trim(),
      email: formData.get("email"),
      phone: formData.get("phone"),
      ...(type === "pravna"
        ? {
            companyName: companyName.trim() || undefined,
            companyAddress: companyAddress.trim() || undefined,
          }
        : {}),
    };

    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSubmitting(false);

    if (!res.ok) {
      setError(
        type === "pravna"
          ? "Provjeri podatke (OIB firme 11 znamenki, naziv firme obavezan)."
          : "Provjeri unesene podatke (OIB mora imati 11 znamenki)."
      );
      return;
    }

    (event.target as HTMLFormElement).reset();
    resetForm();
    load();
  }

  // Client-side filter - broj klijenata je malen (isti obrazac kao ostale
  // liste u appu, ne paginira se), pretraga po imenu, nazivu firme ili OIB-u.
  const filteredClients = clients.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
      (c.companyName ?? "").toLowerCase().includes(q) ||
      c.oib.includes(q)
    );
  });

  return (
    <div>
      <div className="toolbar">
        <h1>Klijenti</h1>
        <a className="btn" href="/clients/import">
          Uvoz klijenata (CSV)
        </a>
      </div>

      <input
        type="search"
        placeholder="Pretraži po imenu, nazivu firme ili OIB-u..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ marginBottom: "1rem", maxWidth: 360 }}
      />

      {loading ? (
        <p className="muted">Učitavanje...</p>
      ) : filteredClients.length === 0 ? (
        <p className="muted">{clients.length === 0 ? "Nema unesenih klijenata." : "Nema rezultata pretrage."}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Tip</th>
              <th>Naziv / Ime i prezime</th>
              <th>OIB</th>
              <th>Email</th>
              <th>Telefon</th>
            </tr>
          </thead>
          <tbody>
            {filteredClients.map((c) => (
              <tr key={c.id}>
                <td>{c.type === "pravna" ? "Pravna osoba" : "Fizička osoba"}</td>
                <td>
                  <a href={`/clients/${c.id}`}>
                    {c.type === "pravna" && c.companyName
                      ? c.companyName
                      : `${c.firstName} ${c.lastName}`}
                  </a>
                  {c.type === "pravna" && c.companyName && (
                    <span className="muted" style={{ marginLeft: "0.4rem" }}>
                      ({c.firstName} {c.lastName})
                    </span>
                  )}
                  {c.hasIncompleteData && (
                    <span title={`Nedostaje: ${c.incompleteReasons.join(", ")}`} style={{ marginLeft: "0.4rem" }}>
                      ⚠️
                    </span>
                  )}
                </td>
                <td>{c.oib}</td>
                <td>{c.email}</td>
                <td>{c.phone}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 style={{ marginTop: "2rem" }}>Novi klijent</h2>
      <form onSubmit={handleSubmit}>
        <fieldset style={{ border: "1px solid var(--border, #ddd)", borderRadius: 6, padding: "0.5rem 0.75rem", marginBottom: "0.5rem" }}>
          <legend className="muted" style={{ padding: "0 0.4rem" }}>Tip klijenta</legend>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", marginRight: "1.25rem" }}>
            <input
              type="radio"
              name="type"
              checked={type === "fizicka"}
              onChange={() => {
                setType("fizicka");
                setLookupState({ status: "idle", message: null });
              }}
            />
            Fizička osoba
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
            <input
              type="radio"
              name="type"
              checked={type === "pravna"}
              onChange={() => setType("pravna")}
            />
            Pravna osoba
          </label>
        </fieldset>

        <label>
          {type === "pravna" ? "OIB firme" : "OIB"}
          {type === "pravna" ? (
            <span style={{ display: "flex", gap: "0.5rem" }}>
              <input
                name="oib"
                required
                pattern="\d{11}"
                title="OIB mora imati 11 znamenki"
                value={oib}
                onChange={(e) => setOib(e.target.value)}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn"
                onClick={handleLookup}
                disabled={lookupState.status === "loading"}
                style={{ whiteSpace: "nowrap" }}
              >
                {lookupState.status === "loading" ? "..." : "Pretraži"}
              </button>
            </span>
          ) : (
            <input
              name="oib"
              required
              pattern="\d{11}"
              title="OIB mora imati 11 znamenki"
              value={oib}
              onChange={(e) => setOib(e.target.value)}
            />
          )}
        </label>
        {type === "pravna" && lookupState.message && (
          <p className="muted" style={{ marginTop: "-0.25rem" }}>
            {lookupState.message}
          </p>
        )}

        {type === "pravna" && (
          <>
            <label>
              Naziv firme
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
              />
            </label>
            <label>
              Adresa sjedišta
              <input value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} />
            </label>
          </>
        )}

        <label>
          {type === "pravna" ? "Ime (odgovorna osoba)" : "Ime"}
          <input name="firstName" required />
        </label>
        <label>
          {type === "pravna" ? "Prezime (odgovorna osoba)" : "Prezime"}
          <input name="lastName" required />
        </label>
        <label>
          Email
          <input name="email" type="email" required />
        </label>
        <label>
          Telefon
          <input name="phone" required />
        </label>

        {error && <p className="error">{error}</p>}

        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Spremanje..." : "Dodaj klijenta"}
        </button>
      </form>
    </div>
  );
}
