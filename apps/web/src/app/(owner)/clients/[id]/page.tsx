"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatDateHr } from "@rent-a-car/api";
import { CLIENT_DOCUMENT_SLOTS, type ClientDocumentSlot } from "@rent-a-car/api";
import type { ClientDTO } from "@rent-a-car/api/server";

const SLOT_LABELS: Record<ClientDocumentSlot, string> = {
  idDocumentFront: "Osobna iskaznica - prednja strana",
  idDocumentBack: "Osobna iskaznica - stražnja strana",
  driverLicenseFront: "Vozačka dozvola - prednja strana",
  driverLicenseBack: "Vozačka dozvola - stražnja strana",
};

const SLOT_URL_FIELD: Record<ClientDocumentSlot, keyof ClientDTO> = {
  idDocumentFront: "idDocumentFrontUrl",
  idDocumentBack: "idDocumentBackUrl",
  driverLicenseFront: "driverLicenseFrontUrl",
  driverLicenseBack: "driverLicenseBackUrl",
};

interface SlotState {
  file: File | null;
  previewUrl: string | null;
  uploading: boolean;
  error: string | null;
}

const EMPTY_SLOT_STATE: SlotState = { file: null, previewUrl: null, uploading: false, error: null };

interface ClientContractItem {
  id: string;
  number: number;
  clientId: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  vehicle: { make: string; model: string; licensePlate: string };
  contractPdfUrl: string | null;
}

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;

  const [client, setClient] = useState<ClientDTO | null>(null);
  const [loading, setLoading] = useState(true);

  const [contracts, setContracts] = useState<ClientContractItem[]>([]);
  const [contractsLoading, setContractsLoading] = useState(true);

  const [slots, setSlots] = useState<Record<ClientDocumentSlot, SlotState>>({
    idDocumentFront: EMPTY_SLOT_STATE,
    idDocumentBack: EMPTY_SLOT_STATE,
    driverLicenseFront: EMPTY_SLOT_STATE,
    driverLicenseBack: EMPTY_SLOT_STATE,
  });

  function loadClient() {
    setLoading(true);
    fetch(`/api/clients/${clientId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setClient(data);
        setLoading(false);
      });
  }

  useEffect(loadClient, [clientId]);

  useEffect(() => {
    fetch("/api/contracts")
      .then((res) => res.json())
      .then((data: ClientContractItem[]) => setContracts(data))
      .finally(() => setContractsLoading(false));
  }, []);

  function handleSlotFileSelected(slot: ClientDocumentSlot, file: File | null) {
    setSlots((prev) => ({
      ...prev,
      [slot]: { ...EMPTY_SLOT_STATE, file, previewUrl: file ? URL.createObjectURL(file) : null },
    }));
  }

  async function handleSlotSave(slot: ClientDocumentSlot) {
    const state = slots[slot];
    if (!state.file) return;

    setSlots((prev) => ({ ...prev, [slot]: { ...prev[slot], uploading: true, error: null } }));

    const formData = new FormData();
    formData.append("file", state.file);
    formData.append("slot", slot);
    const res = await fetch(`/api/clients/${clientId}/documents`, { method: "POST", body: formData });

    if (!res.ok) {
      setSlots((prev) => ({
        ...prev,
        [slot]: { ...prev[slot], uploading: false, error: "Greška prilikom uploada. Pokušaj ponovno." },
      }));
      return;
    }

    setClient(await res.json());
    setSlots((prev) => ({ ...prev, [slot]: EMPTY_SLOT_STATE }));
  }

  if (loading) return <p className="muted">Učitavanje...</p>;
  if (!client) return <p className="error">Klijent nije pronađen.</p>;

  const missingSlots = CLIENT_DOCUMENT_SLOTS.filter((slot) => !client[SLOT_URL_FIELD[slot]]);
  const clientContracts = contracts
    .filter((c) => c.clientId === clientId)
    .sort((a, b) => new Date(b.dateFrom).getTime() - new Date(a.dateFrom).getTime());

  return (
    <div>
      <h1>
        {client.firstName} {client.lastName}
      </h1>

      {client.hasIncompleteData && (
        <div
          style={{
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            border: "1px solid #d97706",
            borderRadius: "6px",
            background: "#fffbeb",
            color: "#92400e",
          }}
        >
          ⚠️ <strong>Nepotpuni podaci</strong> (vjerojatno uvezeno preko CSV-a): {client.incompleteReasons.join(", ")}
        </div>
      )}

      <div style={{ marginBottom: "1rem" }}>
        <p style={{ margin: "0.2rem 0" }}>
          <span className="muted">OIB: </span>
          {client.oib}
        </p>
        <p style={{ margin: "0.2rem 0" }}>
          <span className="muted">Email: </span>
          {client.email}
        </p>
        <p style={{ margin: "0.2rem 0" }}>
          <span className="muted">Telefon: </span>
          {client.phone}
        </p>
        {client.address && (
          <p style={{ margin: "0.2rem 0" }}>
            <span className="muted">Adresa: </span>
            {client.address}
          </p>
        )}
        {client.idNumber && (
          <p style={{ margin: "0.2rem 0" }}>
            <span className="muted">Broj osobne: </span>
            {client.idNumber}
          </p>
        )}
        {client.driverLicenseNumber && (
          <p style={{ margin: "0.2rem 0" }}>
            <span className="muted">Broj vozačke: </span>
            {client.driverLicenseNumber}
          </p>
        )}
        {client.birthDate && (
          <p style={{ margin: "0.2rem 0" }}>
            <span className="muted">Datum rođenja: </span>
            {formatDateHr(client.birthDate)}
          </p>
        )}
      </div>

      <h2 style={{ marginTop: "2rem" }}>Dokumenti</h2>
      <p className="muted" style={{ margin: "0.25rem 0 1rem" }}>
        Osobna iskaznica i vozačka dozvola (obje strane) - potrebno za dokaznost tko je vozio
        vozilo u slučaju prometnog prekršaja. Ovo je odvojeno od automatske OCR ekstrakcije
        podataka (ta je na čekanju) - ovdje se samo prati jesu li slike/skenovi prisutni.
      </p>

      {missingSlots.length > 0 ? (
        <div
          style={{
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            border: "1px solid #d97706",
            borderRadius: "6px",
            background: "#fffbeb",
            color: "#92400e",
          }}
        >
          ⚠️ Nedostaje: {missingSlots.map((s) => SLOT_LABELS[s]).join(", ")}
        </div>
      ) : (
        <div
          style={{
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            border: "1px solid #16a34a",
            borderRadius: "6px",
            background: "#f0fdf4",
            color: "#166534",
          }}
        >
          ✓ Svi dokumenti su priloženi.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "1rem" }}>
        {CLIENT_DOCUMENT_SLOTS.map((slot) => {
          const currentUrl = client[SLOT_URL_FIELD[slot]] as string | null;
          const state = slots[slot];
          return (
            <div
              key={slot}
              style={{ padding: "1rem", border: "1px solid var(--border, #ddd)", borderRadius: "8px" }}
            >
              <strong>{SLOT_LABELS[slot]}</strong>

              {state.previewUrl ? (
                <div className="image-grid" style={{ marginTop: "0.5rem" }}>
                  <figure>
                    <img src={state.previewUrl} alt={SLOT_LABELS[slot]} />
                    <figcaption className="muted">{state.file?.name}</figcaption>
                  </figure>
                </div>
              ) : currentUrl ? (
                <p style={{ margin: "0.5rem 0" }}>
                  <a href={currentUrl} target="_blank" rel="noreferrer">
                    Pregledaj trenutni dokument
                  </a>
                </p>
              ) : (
                <p className="muted" style={{ margin: "0.5rem 0" }}>
                  Nedostaje.
                </p>
              )}

              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleSlotFileSelected(slot, e.target.files?.[0] ?? null)}
                disabled={state.uploading}
              />
              {state.file && (
                <button
                  className="btn btn-primary"
                  onClick={() => handleSlotSave(slot)}
                  disabled={state.uploading}
                  style={{ marginTop: "0.5rem" }}
                >
                  {state.uploading ? "Spremanje..." : currentUrl ? "Zamijeni" : "Spremi"}
                </button>
              )}
              {state.error && <p className="error">{state.error}</p>}
            </div>
          );
        })}
      </div>

      <h2 style={{ marginTop: "2rem" }}>Ugovori</h2>
      {contractsLoading ? (
        <p className="muted">Učitavanje...</p>
      ) : clientContracts.length === 0 ? (
        <p className="muted">Nema ugovora za ovog klijenta.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Broj</th>
              <th>Vozilo</th>
              <th>Od</th>
              <th>Do</th>
              <th>Status</th>
              <th>Dokument</th>
            </tr>
          </thead>
          <tbody>
            {clientContracts.map((c) => (
              <tr key={c.id}>
                <td>{c.number}</td>
                <td>
                  {c.vehicle.make} {c.vehicle.model} ({c.vehicle.licensePlate})
                </td>
                <td>{formatDateHr(c.dateFrom)}</td>
                <td>{formatDateHr(c.dateTo)}</td>
                <td>{c.status}</td>
                <td>
                  {c.contractPdfUrl ? (
                    <a href={c.contractPdfUrl} target="_blank" rel="noreferrer">
                      Preuzmi PDF
                    </a>
                  ) : (
                    <span className="muted">—</span>
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
