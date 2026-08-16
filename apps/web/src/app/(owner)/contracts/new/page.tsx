"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Client } from "@rent-a-car/api";
import type { VehicleDTO } from "@rent-a-car/api/server";

export default function NewContractPage() {
  const router = useRouter();
  const [vehicles, setVehicles] = useState<VehicleDTO[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/vehicles")
      .then((res) => res.json())
      .then(setVehicles);
    fetch("/api/clients")
      .then((res) => res.json())
      .then(setClients);
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const payload = {
      vehicleId: formData.get("vehicleId"),
      clientId: formData.get("clientId"),
      dateFrom: formData.get("dateFrom"),
      dateTo: formData.get("dateTo"),
    };

    const res = await fetch("/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSubmitting(false);

    if (!res.ok) {
      setError("Greška prilikom kreiranja ugovora. Provjeri datume i odabir.");
      return;
    }

    router.push("/contracts");
  }

  return (
    <div>
      <h1>Novi ugovor</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Vozilo
          <select name="vehicleId" required defaultValue="">
            <option value="" disabled>
              Odaberi vozilo
            </option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.make} {v.model} ({v.licensePlate})
              </option>
            ))}
          </select>
        </label>

        <label>
          Klijent
          <select name="clientId" required defaultValue="">
            <option value="" disabled>
              Odaberi klijenta
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName} {c.lastName} ({c.email})
              </option>
            ))}
          </select>
        </label>

        <label>
          Datum od
          <input name="dateFrom" type="date" required />
        </label>
        <label>
          Datum do
          <input name="dateTo" type="date" required />
        </label>

        {error && <p className="error">{error}</p>}
        {clients.length === 0 && (
          <p className="muted">
            Nema klijenata — prvo <a href="/clients">dodaj klijenta</a>.
          </p>
        )}

        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Slanje..." : "Kreiraj i pošalji na potpis"}
        </button>
      </form>
    </div>
  );
}
