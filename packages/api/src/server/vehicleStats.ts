import { prisma } from "../db/client";
import { calculateProRatedVehicleCosts } from "./vehicleCosts";

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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetweenInclusive(from: Date, to: Date): number {
  const diff = startOfDay(to).getTime() - startOfDay(from).getTime();
  return Math.max(0, Math.floor(diff / MS_PER_DAY) + 1);
}

/**
 * Broj dana preklapanja dva raspona (uključivo oba kraja, dnevna
 * granularnost) - 0 ako se uopće ne preklapaju.
 */
function overlapDays(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): number {
  const start = aStart > bStart ? aStart : bStart;
  const end = aEnd < bEnd ? aEnd : bEnd;
  if (startOfDay(start) > startOfDay(end)) return 0;
  return daysBetweenInclusive(start, end);
}

export type VehicleStatsStatus = "good" | "ok" | "bad" | "no_activity";

export interface VehicleStatsDTO {
  vehicleId: string;
  rangeFrom: Date;
  rangeTo: Date;
  totalDays: number;
  rentedDays: number;
  freeDays: number;
  revenue: number;
  serviceCost: number;
  additionalCosts: number; // VehicleCost, pro-rata za razdoblje (vidi calculateProRatedVehicleCosts)
  profit: number;
  utilization: number; // 0..1
  status: VehicleStatsStatus;
}

/**
 * Profitabilnost jednog vozila za zadano razdoblje. `rangeFrom`/`rangeTo` se
 * tretiraju uključivo (cijeli dani, vidi startOfDay/endOfDay).
 *
 * - "Dana pod ugovorom" - koristi SAMO "signed" ugovore, isti "je li vozilo
 *   trenutno pod ugovorom" kriterij kao computed Vehicle.status (vidi
 *   findCurrentContractForVehicle u ./contracts), ovdje primijenjen po danu
 *   umjesto "danas" trenutku. Ako je ugovor prijevremeno zatvoren
 *   (closedAt postavljen), koristi actualEndDate kao stvarni kraj - NE
 *   originalni dateTo (taj ostaje povijesni podatak, vidi
 *   closeContractEarly u ./contracts).
 * - Preklapajući ugovori (blokirano na kreiranju, ali stariji podaci prije
 *   te blokade teoretski mogu postojati) se dedupe-aju kroz Set dana da
 *   iskorištenost nikad ne prijeđe 100%.
 * - Prihod se računa PO UGOVORU (pricePerDay × dana koji upadaju u
 *   razdoblje) i zbraja - namjerno NE iz dedupe-anog dana-seta, jer svaki
 *   ugovor ima svoju cijenu/dan; ako se dva ugovora povijesno preklapaju,
 *   prihod od oba se svejedno stvarno naplatio.
 */
export async function getVehicleStats(
  vehicleId: string,
  rangeFrom: Date,
  rangeTo: Date
): Promise<VehicleStatsDTO> {
  const from = startOfDay(rangeFrom);
  const to = endOfDay(rangeTo);

  const [contracts, serviceRecords, vehicleCosts] = await Promise.all([
    prisma.contract.findMany({
      where: {
        vehicleId,
        status: "signed",
        dateFrom: { lte: to },
      },
      select: { dateFrom: true, dateTo: true, closedAt: true, actualEndDate: true, pricePerDay: true },
    }),
    prisma.serviceRecord.findMany({
      where: { vehicleId, date: { gte: from, lte: to } },
      select: { cost: true },
    }),
    prisma.vehicleCost.findMany({
      where: { vehicleId },
      select: { isInstallment: true, installmentFrequency: true, startDate: true, endDate: true, date: true, amount: true },
    }),
  ]);

  const rentedDaySet = new Set<string>();
  let revenue = 0;

  for (const c of contracts) {
    const effectiveEnd = c.closedAt && c.actualEndDate ? c.actualEndDate : c.dateTo;
    const overlap = overlapDays(c.dateFrom, effectiveEnd, from, to);
    if (overlap <= 0) continue;

    if (c.pricePerDay != null) revenue += c.pricePerDay * overlap;

    const clippedStart = startOfDay(c.dateFrom > from ? c.dateFrom : from);
    const clippedEndTime = startOfDay(effectiveEnd < to ? effectiveEnd : to).getTime();
    for (let d = clippedStart; d.getTime() <= clippedEndTime; d.setDate(d.getDate() + 1)) {
      rentedDaySet.add(d.toISOString().slice(0, 10));
    }
  }

  const serviceCost = serviceRecords.reduce((sum, r) => sum + r.cost, 0);
  const additionalCosts = calculateProRatedVehicleCosts(vehicleCosts, from, to);
  const totalDays = daysBetweenInclusive(from, to);
  const rentedDays = Math.min(rentedDaySet.size, totalDays);
  const freeDays = totalDays - rentedDays;
  const profit = revenue - serviceCost - additionalCosts;
  const utilization = totalDays > 0 ? rentedDays / totalDays : 0;

  // Prvi pokušaj pragova (korisnikov eksplicitan zahtjev - "može se kasnije
  // fino podesiti"): "no_activity" je dodatno 4. stanje uz zeleno/žuto/
  // crveno iz zahtjeva - vozilo bez ijednog iznajmljenog dana I bez ijednog
  // troška (servis ILI dodatni) u razdoblju nije ni "dobro" ni "loše", nego
  // "nema podataka za prosudbu" (npr. tek dodano vozilo, ili zaboravljeno).
  // Vozilo s aktivnom ratom ali bez iznajmljivanja NIJE "no_activity" - i
  // dalje aktivno troši novac, treba se vidjeti kao "bad" (negativan profit).
  let status: VehicleStatsStatus;
  if (rentedDays === 0 && serviceCost === 0 && additionalCosts === 0) {
    status = "no_activity";
  } else if (profit > 0 && utilization > 0.6) {
    status = "good";
  } else if (profit > 0) {
    status = "ok";
  } else {
    status = "bad";
  }

  return {
    vehicleId,
    rangeFrom: from,
    rangeTo: to,
    totalDays,
    rentedDays,
    freeDays,
    revenue,
    serviceCost,
    additionalCosts,
    profit,
    utilization,
    status,
  };
}

/**
 * Isti izračun za cijelu flotu odjednom - koristi /vehicles/stats pregledna
 * tablica. Flota je mala (isti obrazac kao svugdje u appu - nema
 * paginacije), pa N upita po vozilu nije problem.
 */
export async function getFleetStats(rangeFrom: Date, rangeTo: Date): Promise<VehicleStatsDTO[]> {
  const vehicles = await prisma.vehicle.findMany({ select: { id: true } });
  return Promise.all(vehicles.map((v) => getVehicleStats(v.id, rangeFrom, rangeTo)));
}
