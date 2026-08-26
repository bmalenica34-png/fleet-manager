"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDateHr } from "@rent-a-car/api";

interface RentPaymentDTO {
  id: string;
  contractId: string;
  contractNumber: number;
  vehicleLabel: string;
  clientName: string;
  periodStart: string;
  periodEnd: string;
  amount: number;
  dueDate: string;
  paid: boolean;
  paidAt: string | null;
}

type StatusFilter = "unpaid" | "paid" | "all";

export default function NajmoviPage() {
  const [payments, setPayments] = useState<RentPaymentDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("unpaid");
  const [markingId, setMarkingId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/rent-payments")
      .then((res) => res.json())
      .then((data) => {
        setPayments(data);
        setLoading(false);
      });
  }

  useEffect(() => {
    load();
  }, []);

  async function handleMarkPaid(id: string) {
    setMarkingId(id);
    await fetch(`/api/rent-payments/${id}/mark-paid`, { method: "POST" });
    setMarkingId(null);
    load();
  }

  // Neplaćeno prvo po defaultu (backend već sortira paid=false prije
  // paid=true, dueDate rastuće unutar toga) - filter ovdje samo suzuje
  // prikaz, ne mijenja poredak.
  const filtered = useMemo(() => {
    if (filter === "unpaid") return payments.filter((p) => !p.paid);
    if (filter === "paid") return payments.filter((p) => p.paid);
    return payments;
  }, [payments, filter]);

  const totalUnpaid = payments.filter((p) => !p.paid).reduce((sum, p) => sum + p.amount, 0);

  return (
    <div>
      <div className="toolbar">
        <h1>Najmovi</h1>
      </div>

      <p className="muted" style={{ margin: "0.25rem 0 1rem" }}>
        Svi periodi naplate za tjedne/mjesečne ugovore (svako vozilo, svaki klijent). Generiraju se
        automatski pri kreiranju/produženju ugovora s takvom učestalošću naplate.
      </p>

      {!loading && (
        <p>
          <strong>Ukupno neplaćeno: {totalUnpaid.toFixed(2)} €</strong>
        </p>
      )}

      <div className="toolbar" style={{ marginTop: "0.5rem" }}>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            className={`btn${filter === "unpaid" ? " btn-primary" : ""}`}
            onClick={() => setFilter("unpaid")}
          >
            Neplaćeno
          </button>
          <button
            type="button"
            className={`btn${filter === "paid" ? " btn-primary" : ""}`}
            onClick={() => setFilter("paid")}
          >
            Plaćeno
          </button>
          <button
            type="button"
            className={`btn${filter === "all" ? " btn-primary" : ""}`}
            onClick={() => setFilter("all")}
          >
            Sve
          </button>
        </div>
      </div>

      {loading ? (
        <p className="muted">Učitavanje...</p>
      ) : filtered.length === 0 ? (
        <p className="muted">Nema redaka za odabrani filter.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Klijent</th>
              <th>Vozilo</th>
              <th>Period</th>
              <th>Dospijeće</th>
              <th>Iznos</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id}>
                <td>
                  <a href={`/contracts`}>{p.clientName}</a>
                </td>
                <td>{p.vehicleLabel}</td>
                <td>
                  {formatDateHr(p.periodStart)} – {formatDateHr(p.periodEnd)}
                </td>
                <td>{formatDateHr(p.dueDate)}</td>
                <td>{p.amount.toFixed(2)} €</td>
                <td>
                  {p.paid ? (
                    <span style={{ color: "#166534" }}>✓ Plaćeno {p.paidAt ? formatDateHr(p.paidAt) : ""}</span>
                  ) : (
                    <span style={{ color: "#92400e" }}>Nije plaćeno</span>
                  )}
                </td>
                <td>
                  {!p.paid && (
                    <button
                      className="btn btn-primary"
                      onClick={() => handleMarkPaid(p.id)}
                      disabled={markingId === p.id}
                    >
                      {markingId === p.id ? "Spremanje..." : "Plaćeno"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
