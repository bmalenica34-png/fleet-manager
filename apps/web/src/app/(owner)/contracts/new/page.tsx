"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Client } from "@rent-a-car/api";
import type { VehicleDTO } from "@rent-a-car/api/server";
import { formatDateHr } from "@rent-a-car/api";

type DateFromMode = "today" | "tomorrow" | "custom";

interface ActiveContractSummary {
  id: string;
  number: number;
  dateTo: string;
  client: { firstName: string; lastName: string };
}

function todayIso(): string {
  return offsetIso(0);
}

function offsetIso(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function NewContractPage() {
  const router = useRouter();
  const [vehicles, setVehicles] = useState<VehicleDTO[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [vehicleId, setVehicleId] = useState("");
  const [clientId, setClientId] = useState("");

  const [vehicleActiveContract, setVehicleActiveContract] = useState<ActiveContractSummary | null>(null);
  const [checkingActiveContract, setCheckingActiveContract] = useState(false);
  const [closingActiveContract, setClosingActiveContract] = useState(false);

  useEffect(() => {
    if (!vehicleId) {
      setVehicleActiveContract(null);
      return;
    }
    let cancelled = false;
    setCheckingActiveContract(true);
    fetch(`/api/vehicles/${vehicleId}/active-contract`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setVehicleActiveContract(data);
      })
      .finally(() => {
        if (!cancelled) setCheckingActiveContract(false);
      });
    return () => {
      cancelled = true;
    };
  }, [vehicleId]);

  async function handleCloseActiveContract() {
    if (!vehicleActiveContract) return;
    setClosingActiveContract(true);
    await fetch(`/api/contracts/${vehicleActiveContract.id}/close`, { method: "POST" });
    setClosingActiveContract(false);
    setVehicleActiveContract(null);
  }

  const [dateFromMode, setDateFromMode] = useState<DateFromMode>("today");
  const [dateFrom, setDateFrom] = useState(todayIso());
  const [days, setDays] = useState("7");
  const [pricePerDay, setPricePerDay] = useState("");
  const [paymentFrequency, setPaymentFrequency] = useState<"daily" | "weekly" | "monthly">("daily");

  const priceFieldLabel =
    paymentFrequency === "weekly"
      ? "Cijena/tjedan (EUR)"
      : paymentFrequency === "monthly"
        ? "Cijena/mjesec (EUR)"
        : "Cijena/dan (EUR)";

  useEffect(() => {
    fetch("/api/vehicles")
      .then((res) => res.json())
      .then(setVehicles);
    fetch("/api/clients")
      .then((res) => res.json())
      .then(setClients);
  }, []);

  function selectDateFrom(mode: DateFromMode) {
    setDateFromMode(mode);
    if (mode === "today") setDateFrom(todayIso());
    if (mode === "tomorrow") setDateFrom(offsetIso(1));
    // "custom" - zadržava trenutni dateFrom, korisnik ga mijenja preko date inputa.
  }

  const dayCount = Number(days);
  const dateTo = dateFrom && dayCount > 0 ? addDaysIso(dateFrom, dayCount) : null;
  const pricePerDayValid = Number(pricePerDay) > 0;
  const canSubmit = Boolean(
    vehicleId && clientId && dateFrom && dateTo && pricePerDayValid && !vehicleActiveContract
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || !dateTo) return;
    setError(null);
    setSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const pickupLocation = formData.get("pickupLocation");
    const odometerStart = formData.get("odometerStart");
    const excessAmount = formData.get("excessAmount");
    const depositAmount = formData.get("depositAmount");
    const paymentMethod = formData.get("paymentMethod");

    const res = await fetch("/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vehicleId,
        clientId,
        dateFrom,
        dateTo,
        pickupLocation: pickupLocation || undefined,
        odometerStart: odometerStart ? Number(odometerStart) : undefined,
        pricePerDay: Number(pricePerDay),
        excessAmount: excessAmount ? Number(excessAmount) : undefined,
        depositAmount: depositAmount ? Number(depositAmount) : undefined,
        paymentMethod: paymentMethod || undefined,
        paymentFrequency,
      }),
    });

    setSubmitting(false);

    if (!res.ok) {
      if (res.status === 409) {
        const body = await res.json().catch(() => null);
        if (body?.error === "vehicle_has_active_contract") setVehicleActiveContract(body.activeContract);
        setError("Ovo vozilo već ima tekući ugovor - zatvori ga prije nastavka.");
        return;
      }
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
          <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} required>
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

        {checkingActiveContract && <p className="muted">Provjera dostupnosti vozila...</p>}

        {vehicleActiveContract && (
          <div
            style={{
              padding: "0.75rem 1rem",
              border: "1px solid #d97706",
              borderRadius: "6px",
              background: "#fffbeb",
              color: "#92400e",
            }}
          >
            ⚠️ Ovo vozilo već ima tekući ugovor br. {vehicleActiveContract.number} (
            {vehicleActiveContract.client.firstName} {vehicleActiveContract.client.lastName}, do{" "}
            {formatDateHr(vehicleActiveContract.dateTo)}). Izdavanje novog ugovora nije moguće dok se
            postojeći ne zatvori.
            <div style={{ marginTop: "0.5rem" }}>
              <button
                type="button"
                className="btn"
                onClick={handleCloseActiveContract}
                disabled={closingActiveContract}
              >
                {closingActiveContract ? "Zatvaranje..." : "Zatvori postojeći ugovor"}
              </button>
            </div>
          </div>
        )}

        <label>
          Klijent
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
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
          Početak najma
          <div className="toolbar" style={{ marginBottom: 0, justifyContent: "flex-start", gap: "0.5rem" }}>
            <button
              type="button"
              className={`btn${dateFromMode === "today" ? " btn-primary" : ""}`}
              onClick={() => selectDateFrom("today")}
            >
              Danas
            </button>
            <button
              type="button"
              className={`btn${dateFromMode === "tomorrow" ? " btn-primary" : ""}`}
              onClick={() => selectDateFrom("tomorrow")}
            >
              Sutra
            </button>
            <button
              type="button"
              className={`btn${dateFromMode === "custom" ? " btn-primary" : ""}`}
              onClick={() => selectDateFrom("custom")}
            >
              Custom
            </button>
          </div>
        </label>
        {dateFromMode === "custom" && (
          <label>
            Odaberi datum
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              required
            />
          </label>
        )}
        {dateFromMode !== "custom" && <p className="muted">{formatDateHr(dateFrom)}</p>}

        <label>
          Trajanje najma (broj dana)
          <input
            type="number"
            min={1}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            required
          />
        </label>
        {dateTo && <p className="muted">Datum povrata: {formatDateHr(dateTo)}</p>}

        <label>
          Učestalost naplate
          <select value={paymentFrequency} onChange={(e) => setPaymentFrequency(e.target.value as typeof paymentFrequency)}>
            <option value="daily">Dnevno (zadano)</option>
            <option value="weekly">Tjedno</option>
            <option value="monthly">Mjesečno</option>
          </select>
        </label>
        {paymentFrequency !== "daily" && (
          <p className="muted">
            Cijena ispod predstavlja cijenu PO {paymentFrequency === "weekly" ? "TJEDNU" : "MJESECU"}, ne po danu.
            Periodi naplate za &quot;Najmovi&quot; stranicu generirat će se automatski za cijelo trajanje ugovora.
          </p>
        )}

        <label>
          {priceFieldLabel}
          <input
            type="number"
            min={0.01}
            step="0.01"
            value={pricePerDay}
            onChange={(e) => setPricePerDay(e.target.value)}
            required
          />
        </label>

        <h2 style={{ marginTop: "1rem" }}>Dodatni podaci (opcionalno)</h2>
        <p className="muted">
          Prikazuju se na ugovoru ako su popunjeni - nisu obavezni za slanje na potpis.
        </p>
        <label>
          Mjesto preuzimanja
          <input name="pickupLocation" />
        </label>
        <label>
          Kilometraža pri preuzimanju
          <input name="odometerStart" type="number" min={0} />
        </label>
        <label>
          Učešće u šteti (EUR)
          <input name="excessAmount" type="number" min={0} step="0.01" />
        </label>
        <label>
          Depozit / učešće (EUR)
          <input name="depositAmount" type="number" min={0} step="0.01" />
        </label>
        <label>
          Način plaćanja
          <input name="paymentMethod" placeholder="npr. Gotovina, Kartica, Transakcijski račun" />
        </label>

        {error && <p className="error">{error}</p>}
        {clients.length === 0 && (
          <p className="muted">
            Nema klijenata — prvo <a href="/clients">dodaj klijenta</a>.
          </p>
        )}

        <button className="btn btn-primary" type="submit" disabled={submitting || !canSubmit}>
          {submitting ? "Slanje..." : "Kreiraj i pošalji na potpis"}
        </button>
      </form>
    </div>
  );
}
