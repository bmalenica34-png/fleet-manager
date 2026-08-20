"use client";

import { useEffect, useState } from "react";
import { formatDateHr } from "@rent-a-car/api";

interface ContractListItem {
  id: string;
  number: number;
  vehicleId: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  vehicle: { make: string; model: string; licensePlate: string };
  client: { firstName: string; lastName: string; email: string };
  contractPdfUrl: string | null;
  protocolPdfUrl: string | null;
  latestAnnex: { status: string; newDateTo: string } | null;
  latestPhotoRequest: { requestedAt: string; fulfilledAt: string | null } | null;
}

function isActive(c: ContractListItem): boolean {
  const now = new Date();
  return c.status === "signed" && new Date(c.dateFrom) <= now && new Date(c.dateTo) >= now;
}

export default function ContractsPage() {
  const [contracts, setContracts] = useState<ContractListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestingId, setRequestingId] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetch("/api/contracts")
      .then((res) => res.json())
      .then((data) => {
        setContracts(data);
        setLoading(false);
      });
  }

  useEffect(() => {
    load();
  }, []);

  async function handleRequestPhotos(id: string) {
    setRequestingId(id);
    await fetch(`/api/contracts/${id}/photo-requests`, { method: "POST" });
    setRequestingId(null);
    load();
  }

  return (
    <div>
      <div className="toolbar">
        <h1>Ugovori</h1>
        <a className="btn btn-primary" href="/contracts/new">
          + Novi ugovor
        </a>
      </div>

      {loading ? (
        <p className="muted">Učitavanje...</p>
      ) : contracts.length === 0 ? (
        <p className="muted">Nema kreiranih ugovora.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Broj</th>
              <th>Vozilo</th>
              <th>Klijent</th>
              <th>Od</th>
              <th>Do</th>
              <th>Status</th>
              <th>Produženje</th>
              <th>Dokumenti</th>
              <th>Slike</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((c) => {
              const hasPendingPhotoRequest = c.latestPhotoRequest && !c.latestPhotoRequest.fulfilledAt;
              return (
                <tr key={c.id}>
                  <td>{c.number}</td>
                  <td>
                    {c.vehicle.make} {c.vehicle.model} ({c.vehicle.licensePlate})
                  </td>
                  <td>
                    {c.client.firstName} {c.client.lastName}
                  </td>
                  <td>{formatDateHr(c.dateFrom)}</td>
                  <td>{formatDateHr(c.dateTo)}</td>
                  <td>{c.status}</td>
                  <td>
                    {c.latestAnnex ? (
                      c.latestAnnex.status === "signed" ? (
                        `Produženo do ${formatDateHr(c.latestAnnex.newDateTo)}`
                      ) : c.latestAnnex.status === "sent" ? (
                        `Zahtjev poslan (do ${formatDateHr(c.latestAnnex.newDateTo)})`
                      ) : (
                        c.latestAnnex.status
                      )
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {c.contractPdfUrl ? (
                      <>
                        <a href={c.contractPdfUrl} target="_blank" rel="noreferrer">
                          ugovor
                        </a>
                        {" / "}
                        <a href={c.protocolPdfUrl ?? undefined} target="_blank" rel="noreferrer">
                          zapisnik
                        </a>
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {hasPendingPhotoRequest ? (
                      <span className="muted">
                        Zahtjev poslan {formatDateHr(c.latestPhotoRequest!.requestedAt)}
                      </span>
                    ) : isActive(c) ? (
                      <button
                        className="btn"
                        onClick={() => handleRequestPhotos(c.id)}
                        disabled={requestingId === c.id}
                      >
                        {requestingId === c.id ? "Slanje..." : "Zatraži slike"}
                      </button>
                    ) : c.latestPhotoRequest?.fulfilledAt ? (
                      <span className="muted">
                        Primljeno {formatDateHr(c.latestPhotoRequest.fulfilledAt)}
                      </span>
                    ) : (
                      <span className="muted">—</span>
                    )}
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
