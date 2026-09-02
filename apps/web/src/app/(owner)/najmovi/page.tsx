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
  const [confirmPayment, setConfirmPayment] = useState<RentPaymentDTO | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  async function markPaid(id: string, issueInvoice: boolean) {
    setConfirmPayment(null);
    setMarkingId(id);
    setNotice(null);
    try {
      const res = await fetch(`/api/rent-payments/${id}/mark-paid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueInvoice }),
      });
      const body = await res.json().catch(() => ({}));
      if (body?.invoiceError) {
        setNotice(`Plaćeno je spremljeno, ali račun nije izdan: ${body.invoiceError}`);
      } else if (body?.invoice) {
        setNotice(
          body.invoice.status === "fiscalized"
            ? `Račun ${body.invoice.number} izdan i fiskaliziran (JIR ${body.invoice.jir}).`
            : `Račun ${body.invoice.number} kreiran ali fiskalizacija nije uspjela — vidi "Računi".`
        );
      }
    } finally {
      setMarkingId(null);
      load();
    }
  }

  // "Neplaćeno" prikazuje SAMO dospjele periode (dueDate <= danas) - ne
  // buduće tjedne/mjesece koji tek dolaze (npr. 4-tjedni ugovor ne smije
  // odmah pokazati sva 4 tjedna kao "neplaćeno"). "Sve" ostaje POTPUNO
  // nefiltriran (puni raspored, uklj. buduće) - to je namjerno "informativni
  // pogled" bez posebne zasebne stranice, isti podatak je već ovdje.
  const filtered = useMemo(() => {
    const isDue = (p: RentPaymentDTO) => new Date(p.dueDate) <= new Date();
    if (filter === "unpaid") return payments.filter((p) => !p.paid && isDue(p));
    if (filter === "paid") return payments.filter((p) => p.paid);
    return payments;
  }, [payments, filter]);

  const totalUnpaid = payments
    .filter((p) => !p.paid && new Date(p.dueDate) <= new Date())
    .reduce((sum, p) => sum + p.amount, 0);

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

      {notice && (
        <div
          style={{
            padding: "0.75rem 1rem",
            margin: "0.5rem 0",
            border: "1px solid var(--border, #ddd)",
            borderRadius: 6,
            background: "#f8fafc",
          }}
        >
          {notice}{" "}
          <button className="btn" style={{ marginLeft: "0.5rem" }} onClick={() => setNotice(null)}>
            OK
          </button>
        </div>
      )}

      {confirmPayment && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
          onClick={() => setConfirmPayment(null)}
        >
          <div
            style={{ background: "var(--bg, #fff)", padding: "1.5rem", borderRadius: 8, maxWidth: 420 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>Izdati račun?</h3>
            <p>
              {confirmPayment.clientName} · {confirmPayment.vehicleLabel} ·{" "}
              <strong>{confirmPayment.amount.toFixed(2)} €</strong>
            </p>
            <p className="muted">
              &ldquo;Da&rdquo; označava plaćeno i izdaje fiskalizirani račun (R1 za pravne, R2 za
              fizičke osobe) te ga šalje klijentu mailom. &ldquo;Ne&rdquo; samo označava plaćeno.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
              <button className="btn btn-primary" onClick={() => markPaid(confirmPayment.id, true)}>
                Da, izdaj račun
              </button>
              <button className="btn" onClick={() => markPaid(confirmPayment.id, false)}>
                Ne, samo plaćeno
              </button>
              <button className="btn" onClick={() => setConfirmPayment(null)}>
                Odustani
              </button>
            </div>
          </div>
        </div>
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
                      onClick={() => setConfirmPayment(p)}
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
