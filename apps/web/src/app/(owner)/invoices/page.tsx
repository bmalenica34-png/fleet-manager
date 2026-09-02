"use client";

import { useEffect, useState } from "react";
import { formatDateHr } from "@rent-a-car/api";
import type { InvoiceDTO } from "@rent-a-car/api/server";

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<InvoiceDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/invoices")
      .then((res) => res.json())
      .then((data: InvoiceDTO[]) => {
        setInvoices(data);
        setLoading(false);
      });
  }

  useEffect(load, []);

  async function openPdf(id: string) {
    const res = await fetch(`/api/invoices/${id}/pdf`);
    if (!res.ok) return;
    const { url } = await res.json();
    window.open(url, "_blank", "noopener");
  }

  async function retry(id: string) {
    setRetryingId(id);
    await fetch(`/api/invoices/${id}/retry`, { method: "POST" });
    setRetryingId(null);
    load();
  }

  return (
    <div>
      <div className="toolbar">
        <h1>Izdani računi</h1>
      </div>
      <p className="muted" style={{ margin: "0.25rem 0 1rem" }}>
        Fiskalizirani R1 / R2 računi. Izdaju se iz &ldquo;Najmovi&rdquo; kad se period naplate
        označi plaćenim. PROBNA faza — cistest CIS okolina, FINA testni certifikat.
      </p>

      {loading ? (
        <p className="muted">Učitavanje...</p>
      ) : invoices.length === 0 ? (
        <p className="muted">Još nema izdanih računa.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Broj</th>
              <th>Datum</th>
              <th>Tip</th>
              <th>Kupac</th>
              <th>Vozilo</th>
              <th>Iznos</th>
              <th>JIR</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td>{inv.number}</td>
                <td>{formatDateHr(inv.issuedAt)}</td>
                <td>{inv.type}</td>
                <td>
                  {inv.recipientName}
                  {inv.recipientOib ? <span className="muted"> · {inv.recipientOib}</span> : null}
                </td>
                <td>{inv.vehicleLabel ?? "—"}</td>
                <td>
                  {inv.totalAmount.toFixed(2)} €
                  {inv.vatRate > 0 ? (
                    <span className="muted"> (PDV {inv.vatAmount.toFixed(2)})</span>
                  ) : null}
                </td>
                <td style={{ fontFamily: "monospace", fontSize: "0.8em" }}>{inv.jir ?? "—"}</td>
                <td>
                  {inv.status === "fiscalized" ? (
                    <span style={{ color: "#166534" }}>✓ fiskaliziran</span>
                  ) : (
                    <span style={{ color: "#b91c1c" }} title={inv.errorMessage ?? ""}>
                      ✗ neuspješno
                    </span>
                  )}
                </td>
                <td style={{ display: "flex", gap: "0.4rem" }}>
                  {inv.hasPdf && (
                    <button className="btn" onClick={() => openPdf(inv.id)}>
                      PDF
                    </button>
                  )}
                  {inv.status === "failed" && (
                    <button className="btn" onClick={() => retry(inv.id)} disabled={retryingId === inv.id}>
                      {retryingId === inv.id ? "..." : "Pokušaj ponovno"}
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
