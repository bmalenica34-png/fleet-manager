"use client";

import { useEffect, useState } from "react";
import type { VehicleDTO } from "@rent-a-car/api/server";
import { formatDateHr } from "@rent-a-car/api";

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<VehicleDTO[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/vehicles");
    setVehicles(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleDelete(id: string) {
    if (!confirm("Obrisati vozilo? Ova radnja je nepovratna.")) return;
    await fetch(`/api/vehicles/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <div className="toolbar">
        <h1>Vozila</h1>
        <a className="btn btn-primary" href="/vehicles/new">
          + Novo vozilo
        </a>
      </div>

      {loading ? (
        <p className="muted">Učitavanje...</p>
      ) : vehicles.length === 0 ? (
        <p className="muted">Nema unesenih vozila.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Marka / model</th>
              <th>Godina</th>
              <th>Registracija</th>
              <th>Ističe</th>
              <th>Prometna</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v) => (
              <tr key={v.id}>
                <td>
                  <a href={`/vehicles/${v.id}`}>
                    {v.make} {v.model}
                  </a>
                </td>
                <td>{v.year ?? "—"}</td>
                <td>{v.licensePlate}</td>
                <td>
                  {v.registrationExpiresAt ? (
                    formatDateHr(v.registrationExpiresAt)
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  {v.registrationDocUrl ? (
                    <a href={v.registrationDocUrl} target="_blank" rel="noreferrer">
                      pregledaj
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <button className="btn btn-danger" onClick={() => handleDelete(v.id)}>
                    Obriši
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
