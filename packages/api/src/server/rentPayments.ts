import type { Contract, RentPayment } from "@prisma/client";
import { prisma } from "../db/client";
import {
  sendRentPaymentDueEmail,
  sendRentPaymentOverdueEmail,
  sendWeeklyPaymentReminderEmail,
} from "../lib/email";

function getOwnerEmail(): string {
  const email = process.env.OWNER_EMAIL;
  if (!email) {
    throw new Error("Missing required env var: OWNER_EMAIL");
  }
  return email;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetweenInclusive(from: Date, to: Date): number {
  const diff = startOfDay(to).getTime() - startOfDay(from).getTime();
  return Math.max(0, Math.floor(diff / MS_PER_DAY) + 1);
}

// Isti pojednostavljeni "monthly = 30 dana" pristup kao vehicleCosts.ts
// pro-rata izračun i periodicReports.ts - ne kalendarski mjesec, fiksna
// aproksimacija, dosljedno s ostatkom repoa.
const PERIOD_DAYS: Record<"weekly" | "monthly", number> = { weekly: 7, monthly: 30 };

export interface RentPaymentPeriodInput {
  contractId: string;
  periodStart: Date;
  periodEnd: Date;
  amount: number;
  dueDate: Date;
}

/**
 * Dijeli [dateFrom, dateTo] na uzastopne periode fiksne duljine (7 ili 30
 * dana) - zadnji period se odsijeca na dateTo ako trajanje nije točan
 * višekratnik (npr. 10-dnevni tjedni ugovor = 2 perioda: dani 1-7, 8-10).
 * `amount` je PUN iznos po periodu za SVAKI period, uklj. odsječeni zadnji -
 * nema pro-rata umanjenja (korisnikov zahtjev: "cijena unesena u formi
 * predstavlja cijenu za taj period", bez naznake da zadnji nepotpuni period
 * treba biti umanjen). dueDate = periodStart (naplata na početku perioda).
 */
export function buildRentPaymentPeriods(params: {
  contractId: string;
  dateFrom: Date;
  dateTo: Date;
  frequency: "weekly" | "monthly";
  amountPerPeriod: number;
}): RentPaymentPeriodInput[] {
  const periodDays = PERIOD_DAYS[params.frequency];
  const from = startOfDay(params.dateFrom);
  const to = startOfDay(params.dateTo);
  if (to < from) return [];

  const totalDays = daysBetweenInclusive(from, to);
  const periodCount = Math.ceil(totalDays / periodDays);

  const periods: RentPaymentPeriodInput[] = [];
  let cursor = from;
  for (let i = 0; i < periodCount; i++) {
    const periodEndCandidate = addDays(cursor, periodDays - 1);
    const periodEnd = periodEndCandidate < to ? periodEndCandidate : to;
    periods.push({
      contractId: params.contractId,
      periodStart: cursor,
      periodEnd,
      amount: params.amountPerPeriod,
      dueDate: cursor,
    });
    cursor = addDays(cursor, periodDays);
  }
  return periods;
}

/**
 * Pozvati NAKON kreiranja Contract retka (createContractAndSendSigningEmail,
 * server/contracts.ts) - "daily" (default) je no-op, nema RentPayment
 * generacije. pricePerDay se koristi kao "cijena po periodu" za weekly/
 * monthly (isti field, drugo značenje ovisno o frequency - vidi schema.prisma
 * komentar).
 */
export async function createRentPaymentsForContract(contract: {
  id: string;
  dateFrom: Date;
  dateTo: Date;
  paymentFrequency: Contract["paymentFrequency"];
  pricePerDay: number | null;
}): Promise<void> {
  if (contract.paymentFrequency === "daily") return;
  if (contract.pricePerDay == null) return;

  const periods = buildRentPaymentPeriods({
    contractId: contract.id,
    dateFrom: contract.dateFrom,
    dateTo: contract.dateTo,
    frequency: contract.paymentFrequency,
    amountPerPeriod: contract.pricePerDay,
  });
  if (periods.length === 0) return;

  await prisma.rentPayment.createMany({ data: periods });
}

/**
 * Pozvati NAKON produženja ugovora (completeAnnexSigning, server/
 * annexes.ts) - generira periode SAMO za produljeni dio (od dana nakon
 * starog dateTo do novog dateTo), nastavljajući postojeći raspored. No-op
 * za "daily" ugovore, ili ako produljenje zapravo ne postoji (newDateTo
 * <= previousDateTo - annex teoretski može i skratiti, iako UI to ne nudi).
 */
export async function extendRentPaymentsForContract(
  contract: { id: string; paymentFrequency: Contract["paymentFrequency"]; pricePerDay: number | null },
  previousDateTo: Date,
  newDateTo: Date
): Promise<void> {
  if (contract.paymentFrequency === "daily") return;
  if (contract.pricePerDay == null) return;

  const extensionStart = addDays(startOfDay(previousDateTo), 1);
  if (extensionStart > startOfDay(newDateTo)) return;

  const periods = buildRentPaymentPeriods({
    contractId: contract.id,
    dateFrom: extensionStart,
    dateTo: newDateTo,
    frequency: contract.paymentFrequency,
    amountPerPeriod: contract.pricePerDay,
  });
  if (periods.length === 0) return;

  await prisma.rentPayment.createMany({ data: periods });
}

export interface RentPaymentDTO {
  id: string;
  contractId: string;
  contractNumber: number;
  vehicleLabel: string;
  clientName: string;
  periodStart: Date;
  periodEnd: Date;
  amount: number;
  dueDate: Date;
  paid: boolean;
  paidAt: Date | null;
}

type RentPaymentWithContract = RentPayment & {
  contract: Contract & {
    vehicle: { make: string; model: string; licensePlate: string };
    client: { firstName: string; lastName: string; email: string };
  };
};

function toRentPaymentDTO(row: RentPaymentWithContract): RentPaymentDTO {
  return {
    id: row.id,
    contractId: row.contractId,
    contractNumber: row.contract.number,
    vehicleLabel: `${row.contract.vehicle.make} ${row.contract.vehicle.model} (${row.contract.vehicle.licensePlate})`,
    clientName: `${row.contract.client.firstName} ${row.contract.client.lastName}`,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    amount: row.amount,
    dueDate: row.dueDate,
    paid: row.paid,
    paidAt: row.paidAt,
  };
}

/**
 * Svi RentPayment redci, svi ugovori/klijenti - koristi ga "Najmovi"
 * stranica (redak = klijent, isti obrazac zatražen). Neplaćeno prvo
 * (dospijeće najranije prvo), plaćeno na kraju - UI dodatno filtrira po
 * statusu, ovo je samo default poredak.
 */
export async function listRentPayments(): Promise<RentPaymentDTO[]> {
  const rows = await prisma.rentPayment.findMany({
    include: { contract: { include: { vehicle: true, client: true } } },
    orderBy: [{ paid: "asc" }, { dueDate: "asc" }],
  });
  return rows.map(toRentPaymentDTO);
}

/** Jedan klik "Plaćeno" - odmah paid=true + paidAt=sada, bez dodatne forme. */
export async function markRentPaymentPaid(id: string): Promise<RentPaymentDTO> {
  const row = await prisma.rentPayment.update({
    where: { id },
    data: { paid: true, paidAt: new Date() },
    include: { contract: { include: { vehicle: true, client: true } } },
  });
  return toRentPaymentDTO(row);
}

export interface RentPaymentCheckResult {
  ownerDueSent: number;
  clientOverdueSent: number;
  fridayReminderSent: boolean;
  errors: { rentPaymentId: string; error: string }[];
}

/**
 * Dnevni provjere - poziva se iz ISTOG cron requesta kao registracijski/
 * incomplete-data checkovi (vidi /api/cron/check-registrations), isti
 * razlog kao svugdje: izbjeći novi vercel.json cron entry (Vercel plan
 * limit broja cron poslova).
 *
 * 1) Owner notifikacija za retke koji dospijevaju DANAS (dueDate = danas),
 *    neplaćeni, dedupe preko ownerDueNotifiedAt.
 * 2) Klijent upozorenje za retke koji su postali dospjeli JUČER (dueDate =
 *    jučer, 1 dan nakon - isti "milestone dan" obrazac kao
 *    registrationReminders.ts, samo "poslije" umjesto "prije"), neplaćeni,
 *    dedupe preko clientOverdueNotifiedAt. Razmak od 1 dan je pretpostavka
 *    (nema postojećeg "X dana nakon" obrasca u repou za direktnu replikaciju
 *    - samo "X dana prije" milestoni) - dogovoreno s korisnikom prije
 *    implementacije.
 * 3) Petkom (dan u tjednu = 5), standing podsjetnik owneru bez obzira na
 *    konkretne dueDate-ove - NEMA dedupe (lagana, niskorizična notifikacija;
 *    dupli slučajni re-run istog dana nije štetan, isti zaključak kao
 *    "ne treba dedupe" odluke drugdje kad trošak duplikata nije značajan).
 */
export async function runRentPaymentChecks(): Promise<RentPaymentCheckResult> {
  const errors: RentPaymentCheckResult["errors"] = [];
  const today = new Date();

  const dueToday = await prisma.rentPayment.findMany({
    where: {
      dueDate: { gte: startOfDay(today), lte: endOfDay(today) },
      paid: false,
      ownerDueNotifiedAt: null,
    },
    include: { contract: { include: { vehicle: true, client: true } } },
  });

  let ownerDueSent = 0;
  for (const row of dueToday) {
    try {
      await sendRentPaymentDueEmail({
        to: getOwnerEmail(),
        clientName: `${row.contract.client.firstName} ${row.contract.client.lastName}`,
        vehicleLabel: `${row.contract.vehicle.make} ${row.contract.vehicle.model} (${row.contract.vehicle.licensePlate})`,
        amount: row.amount,
      });
      await prisma.rentPayment.update({ where: { id: row.id }, data: { ownerDueNotifiedAt: new Date() } });
      ownerDueSent++;
    } catch (err) {
      errors.push({ rentPaymentId: row.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const yesterday = addDays(today, -1);
  const overdue = await prisma.rentPayment.findMany({
    where: {
      dueDate: { gte: startOfDay(yesterday), lte: endOfDay(yesterday) },
      paid: false,
      clientOverdueNotifiedAt: null,
    },
    include: { contract: { include: { vehicle: true, client: true } } },
  });

  let clientOverdueSent = 0;
  for (const row of overdue) {
    try {
      await sendRentPaymentOverdueEmail({
        to: row.contract.client.email,
        clientName: `${row.contract.client.firstName} ${row.contract.client.lastName}`,
        vehicleLabel: `${row.contract.vehicle.make} ${row.contract.vehicle.model} (${row.contract.vehicle.licensePlate})`,
        amount: row.amount,
        dueDate: row.dueDate,
      });
      await prisma.rentPayment.update({ where: { id: row.id }, data: { clientOverdueNotifiedAt: new Date() } });
      clientOverdueSent++;
    } catch (err) {
      errors.push({ rentPaymentId: row.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  let fridayReminderSent = false;
  if (today.getDay() === 5) {
    try {
      await sendWeeklyPaymentReminderEmail({ to: getOwnerEmail() });
      fridayReminderSent = true;
    } catch (err) {
      errors.push({ rentPaymentId: "friday-reminder", error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { ownerDueSent, clientOverdueSent, fridayReminderSent, errors };
}
