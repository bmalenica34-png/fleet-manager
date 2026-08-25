import type { VehicleCost } from "@prisma/client";
import { prisma } from "../db/client";
import type { InstallmentFrequency, VehicleCostCreateInput } from "../schemas/vehicleCost";

export interface VehicleCostDTO {
  id: string;
  vehicleId: string;
  costType: VehicleCost["costType"];
  customType: string | null;
  amount: number;
  isInstallment: boolean;
  installmentFrequency: InstallmentFrequency | null;
  startDate: Date | null;
  endDate: Date | null;
  date: Date | null;
  createdAt: Date;
}

function toDTO(cost: VehicleCost): VehicleCostDTO {
  return {
    id: cost.id,
    vehicleId: cost.vehicleId,
    costType: cost.costType,
    customType: cost.customType,
    amount: cost.amount,
    isInstallment: cost.isInstallment,
    installmentFrequency: cost.installmentFrequency,
    startDate: cost.startDate,
    endDate: cost.endDate,
    date: cost.date,
    createdAt: cost.createdAt,
  };
}

/**
 * Najnoviji prvo - rate sortirane po startDate, jednokratni po date (isti
 * pristup kao ServiceRecord - `date` je relevantniji sortirajući kriterij
 * od `createdAt`, vlasnik unosi retroaktivno). Prisma ne zna sortirati po
 * "date ILI startDate" u jednom `orderBy`, pa se sortira u JS-u nakon dohvata
 * (fleet je malen, isti "nema paginacije" obrazac kao svugdje u appu).
 */
export async function listVehicleCosts(vehicleId: string): Promise<VehicleCostDTO[]> {
  const costs = await prisma.vehicleCost.findMany({ where: { vehicleId } });
  return costs
    .map(toDTO)
    .sort((a, b) => {
      const aDate = (a.date ?? a.startDate ?? a.createdAt).getTime();
      const bDate = (b.date ?? b.startDate ?? b.createdAt).getTime();
      return bDate - aDate;
    });
}

export async function createVehicleCost(input: VehicleCostCreateInput): Promise<VehicleCostDTO> {
  const cost = await prisma.vehicleCost.create({ data: input });
  return toDTO(cost);
}

export async function deleteVehicleCost(id: string): Promise<void> {
  await prisma.vehicleCost.delete({ where: { id } }).catch(() => {});
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetweenInclusive(from: Date, to: Date): number {
  const diff = startOfDay(to).getTime() - startOfDay(from).getTime();
  return Math.max(0, Math.floor(diff / 86400000) + 1);
}

function overlapDays(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): number {
  const start = aStart > bStart ? aStart : bStart;
  const end = aEnd < bEnd ? aEnd : bEnd;
  if (startOfDay(start) > startOfDay(end)) return 0;
  return daysBetweenInclusive(start, end);
}

// Približna duljina jednog obračunskog razdoblja u danima - ista
// pojednostavljena pretpostavka kao "monthly = 30 dana" u
// periodicReports.ts (kalendarski točni mjeseci bi zakomplicirali izračun
// bez stvarne dobiti za ovaj slučaj korištenja).
const INSTALLMENT_PERIOD_DAYS: Record<InstallmentFrequency, number> = {
  monthly: 30,
  quarterly: 91,
  yearly: 365,
};

/**
 * Pro-rata zbroj dodatnih troškova vozila za razdoblje [from,to]:
 * - Jednokratan trošak (`date` postavljen) - uključen SAMO ako `date` upada
 *   u razdoblje (isti pristup kao ServiceRecord.cost).
 * - Rata - `amount × (dana preklapanja / dana u jednom obračunskom
 *   razdoblju)` - npr. mjesečna rata od 200 EUR i 7-dnevno razdoblje
 *   preklapanja → 200 × (7/30) ≈ 46,67 EUR. `endDate` null ("do
 *   daljnjega") tretira se kao da traje BAREM do kraja `to` (rata je i
 *   dalje aktivna, samo krajnji datum još nije poznat/upisan).
 */
export function calculateProRatedVehicleCosts(
  costs: Pick<VehicleCostDTO, "isInstallment" | "installmentFrequency" | "startDate" | "endDate" | "date" | "amount">[],
  from: Date,
  to: Date
): number {
  let total = 0;

  for (const cost of costs) {
    if (cost.isInstallment) {
      if (!cost.installmentFrequency || !cost.startDate) continue;
      const effectiveEnd = cost.endDate ?? to;
      const overlap = overlapDays(cost.startDate, effectiveEnd, from, to);
      if (overlap <= 0) continue;
      const periodDays = INSTALLMENT_PERIOD_DAYS[cost.installmentFrequency];
      total += cost.amount * (overlap / periodDays);
    } else {
      if (!cost.date) continue;
      if (startOfDay(cost.date) >= startOfDay(from) && startOfDay(cost.date) <= startOfDay(to)) {
        total += cost.amount;
      }
    }
  }

  return total;
}

export async function getProRatedVehicleCostsForPeriod(
  vehicleId: string,
  from: Date,
  to: Date
): Promise<number> {
  const costs = await prisma.vehicleCost.findMany({ where: { vehicleId } });
  return calculateProRatedVehicleCosts(costs, from, to);
}
