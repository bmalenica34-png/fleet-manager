"use client";

import { useEffect, useState } from "react";
import type { Client } from "@rent-a-car/api";

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/clients");
    setClients(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const payload = {
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
      oib: formData.get("oib"),
      email: formData.get("email"),
      phone: formData.get("phone"),
    };

    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSubmitting(false);

    if (!res.ok) {
      setError("Provjeri unesene podatke (OIB mora imati 11 znamenki).");
      return;
    }

    (event.target as HTMLFormElement).reset();
    load();
  }

  return (
    <div>
      <h1>Klijenti</h1>

      {loading ? (
        <p className="muted">Učitavanje...</p>
      ) : clients.length === 0 ? (
        <p className="muted">Nema unesenih klijenata.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Ime i prezime</th>
              <th>OIB</th>
              <th>Email</th>
              <th>Telefon</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id}>
                <td>
                  {c.firstName} {c.lastName}
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
        <label>
          Ime
          <input name="firstName" required />
        </label>
        <label>
          Prezime
          <input name="lastName" required />
        </label>
        <label>
          OIB
          <input name="oib" required pattern="\d{11}" title="OIB mora imati 11 znamenki" />
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
