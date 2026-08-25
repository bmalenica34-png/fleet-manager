"use client";

import { useEffect, useState } from "react";
import type { VehicleDTO } from "@rent-a-car/api/server";
import StatsChart, { type ChartPoint } from "./StatsChart";

type StatsStatus = "good" | "ok" | "bad" | "no_activity";

interface VehicleStatsDTO {
  vehicleId: string;
  totalDays: number;
  rentedDays: number;
  freeDays: number;
  revenue: number;
  serviceCost: number;
  additionalCosts: number;
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

// "" (prazan string) = "Sva vozila" - koristi se izravno kao <select> value
// i kao query param (izostavljen ?vehicleId= znači "sva vozila", vidi
// GET /api/stats/timeseries).
const ALL_VEHICLES = "";

export default function DashboardPage() {
  const [vehicles, setVehicles] = useState<VehicleDTO[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState(ALL_VEHICLES);

  // Pre-selektira vozilo iz `?vehicleId=` (link s vehicle-detail "Statistika"
  // taba, "Vidi na dashboardu") - čita se izravno preko window.location
  // umjesto next/navigation useSearchParams() da se izbjegne obavezan
  // Suspense boundary za taj hook u Next 14 App Routeru (ova stranica je
  // već cijela "use client" i sve podatke učitava kroz useEffect, pa čisto
  // klijentsko čitanje ovdje ne gubi ništa).
  useEffect(() => {
    const fromQuery = new URLSearchParams(window.location.search).get("vehicleId");
    if (fromQuery) setSelectedVehicleId(fromQuery);
  }, []);
  const [from, setFrom] = useState(() => daysAgoIsoDate(29));
  const [to, setTo] = useState(() => todayIsoDate());

  const [fleetStats, setFleetStats] = useState<VehicleStatsDTO[]>([]);
  const [vehicleStats, setVehicleStats] = useState<VehicleStatsDTO | null>(null);
  const [chartPoints, setChartPoints] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/vehicles")
      .then((res) => res.json())
      .then(setVehicles);
  }, []);

  useEffect(() => {
    if (!from || !to) return;
    setLoading(true);

    const statsRequest =
      selectedVehicleId === ALL_VEHICLES
        ? fetch(`/api/vehicles/stats?from=${from}&to=${to}`).then((res) => res.json())
        : fetch(`/api/vehicles/${selectedVehicleId}/stats?from=${from}&to=${to}`).then((res) => res.json());

    const timeseriesUrl =
      selectedVehicleId === ALL_VEHICLES
        ? `/api/stats/timeseries?from=${from}&to=${to}`
        : `/api/stats/timeseries?vehicleId=${selectedVehicleId}&from=${from}&to=${to}`;

    Promise.all([statsRequest, fetch(timeseriesUrl).then((res) => res.json())])
      .then(([stats, series]) => {
        if (selectedVehicleId === ALL_VEHICLES) {
          setFleetStats(stats);
          setVehicleStats(null);
        } else {
          setVehicleStats(stats);
          setFleetStats([]);
        }
        setChartPoints(series);
      })
      .finally(() => setLoading(false));
  }, [selectedVehicleId, from, to]);

  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
  const sortedFleetStats = [...fleetStats].sort((a, b) => b.profit - a.profit);

  const totals =
    selectedVehicleId === ALL_VEHICLES
      ? fleetStats.reduce(
          (acc, s) => ({
            revenue: acc.revenue + s.revenue,
            serviceCost: acc.serviceCost + s.serviceCost,
            additionalCosts: acc.additionalCosts + s.additionalCosts,
            profit: acc.profit + s.profit,
            rentedDays: acc.rentedDays + s.rentedDays,
            totalDays: acc.totalDays + s.totalDays,
          }),
          { revenue: 0, serviceCost: 0, additionalCosts: 0, profit: 0, rentedDays: 0, totalDays: 0 }
        )
      : vehicleStats;

  return (
    <div>
      <div className="toolbar">
        <h1>Dashboard</h1>
        <a className="btn" href={`/api/reports/pdf?from=${from}&to=${to}`} target="_blank" rel="noreferrer">
          Preuzmi PDF izvještaj
        </a>
      </div>

      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-end", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <label>
          Vozilo
          <select value={selectedVehicleId} onChange={(e) => setSelectedVehicleId(e.target.value)}>
            <option value={ALL_VEHICLES}>Sva vozila</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.make} {v.model} ({v.licensePlate})
              </option>
            ))}
          </select>
        </label>
        <label>
          Od
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Do
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      {loading || !totals ? (
        <p className="muted">Učitavanje...</p>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
            {vehicleStats && <StatusBadge status={vehicleStats.status} />}
            <span className="muted">
              {totals.totalDays} dana u razdoblju · dana pod ugovorom {totals.rentedDays}/{totals.totalDays}
            </span>
          </div>

          <table style={{ marginBottom: "1.5rem" }}>
            <tbody>
              <tr>
                <td>Prihod</td>
                <td>{totals.revenue.toFixed(2)} €</td>
              </tr>
              <tr>
                <td>Trošak servisa</td>
                <td>{totals.serviceCost.toFixed(2)} €</td>
              </tr>
              <tr>
                <td>Dodatni troškovi (leasing/osiguranje/ostalo)</td>
                <td>{totals.additionalCosts.toFixed(2)} €</td>
              </tr>
              <tr>
                <td>
                  <strong>Profit</strong>
                </td>
                <td>
                  <strong>{totals.profit.toFixed(2)} €</strong>
                </td>
              </tr>
            </tbody>
          </table>

          <h2 style={{ marginBottom: "0.5rem" }}>Kretanje kroz vrijeme</h2>
          <StatsChart points={chartPoints} />

          {selectedVehicleId === ALL_VEHICLES && (
            <>
              <h2 style={{ marginTop: "2rem", marginBottom: "0.5rem" }}>Po vozilu (sortirano po profitu)</h2>
              {sortedFleetStats.length === 0 ? (
                <p className="muted">Nema unesenih vozila.</p>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Vozilo</th>
                      <th>Dana pod ugovorom</th>
                      <th>Prihod</th>
                      <th>Trošak servisa</th>
                      <th>Dodatni troškovi</th>
                      <th>Profit</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedFleetStats.map((s) => {
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
                          <td>{s.additionalCosts.toFixed(2)} €</td>
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
            </>
          )}
        </>
      )}
    </div>
  );
}
