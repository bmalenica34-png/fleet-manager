"use client";

import { useEffect, useState } from "react";
import type { VehicleDTO } from "@rent-a-car/api/server";

type StatsStatus = "good" | "ok" | "bad" | "no_activity";

interface VehicleStatsDTO {
  vehicleId: string;
  totalDays: number;
  rentedDays: number;
  freeDays: number;
  revenue: number;
  serviceCost: number;
  profit: number;
  utilization: number;
  status: StatsStatus;
}

const STATUS_BADGE: Record<StatsStatus, { label: string; bg: string; fg: string }> = {
  good: { label: "Dobro", bg: "#f0fdf4", fg: "#166534" },
  ok: { label: "Prosječno", bg: "#fefce8", fg: "#854d0e" },
  bad: { label: "Loše", bg: "#fef2f2", fg: "#b91c1c" },
  no_activity: { label: "Bez aktivnosti", bg: "#f3f4f6", fg: "#374151" },
};

function StatusBadge({ status }: { status: StatsStatus }) {
  const { label, bg, fg } = STATUS_BADGE[status];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.15rem 0.55rem",
        borderRadius: "999px",
        fontSize: "0.8rem",
        background: bg,
        color: fg,
      }}
    >
      {label}
    </span>
  );
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIsoDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function FleetStatsPage() {
  const [vehicles, setVehicles] = useState<VehicleDTO[]>([]);
  const [stats, setStats] = useState<VehicleStatsDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => daysAgoIsoDate(29));
  const [to, setTo] = useState(() => todayIsoDate());

  useEffect(() => {
    fetch("/api/vehicles")
      .then((res) => res.json())
      .then(setVehicles);
  }, []);

  useEffect(() => {
    if (!from || !to) return;
    setLoading(true);
    fetch(`/api/vehicles/stats?from=${from}&to=${to}`)
      .then((res) => res.json())
      .then(setStats)
      .finally(() => setLoading(false));
  }, [from, to]);

  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));

  // Sortirano po profitu opadajuće - korisnikov eksplicitan zahtjev.
  const sortedStats = [...stats].sort((a, b) => b.profit - a.profit);

  return (
    <div>
      <div className="toolbar">
        <h1>Statistika flote</h1>
        <a className="btn" href="/vehicles">
          Natrag na vozila
        </a>
      </div>

      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end", marginBottom: "1.5rem" }}>
        <label>
          Od
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Do
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      {loading ? (
        <p className="muted">Učitavanje...</p>
      ) : sortedStats.length === 0 ? (
        <p className="muted">Nema unesenih vozila.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Vozilo</th>
              <th>Dana pod ugovorom</th>
              <th>Prihod</th>
              <th>Trošak servisa</th>
              <th>Profit</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {sortedStats.map((s) => {
              const vehicle = vehicleById.get(s.vehicleId);
              return (
                <tr key={s.vehicleId}>
                  <td>
                    <a href={`/vehicles/${s.vehicleId}`}>
                      {vehicle ? `${vehicle.make} ${vehicle.model} (${vehicle.licensePlate})` : s.vehicleId}
                    </a>
                  </td>
                  <td>
                    {s.rentedDays} / {s.totalDays}
                  </td>
                  <td>{s.revenue.toFixed(2)} €</td>
                  <td>{s.serviceCost.toFixed(2)} €</td>
                  <td>{s.profit.toFixed(2)} €</td>
                  <td>
                    <StatusBadge status={s.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
