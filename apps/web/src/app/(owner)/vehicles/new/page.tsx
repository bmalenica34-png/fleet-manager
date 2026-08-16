"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewVehiclePage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

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

  return (
    <div>
      <h1>Novo vozilo</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Marka
          <input name="make" required />
        </label>
        <label>
          Model
          <input name="model" required />
        </label>
        <label>
          Godina
          <input name="year" type="number" min={1950} />
        </label>
        <label>
          Registarske tablice
          <input name="licensePlate" required />
        </label>
        <label>
          VIN
          <input name="vin" />
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
