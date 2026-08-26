import type { ServiceRecord } from "@prisma/client";
import { prisma } from "../db/client";
import type { ServiceRecordCreateInput } from "../schemas/serviceRecord";
import { deleteObject, getPresignedDownloadUrl } from "../storage/hetzner";

export interface ServiceRecordDTO {
  id: string;
  vehicleId: string;
  date: Date;
  description: string;
  partsCost: number | null;
  laborCost: number | null;
  total: number;
  provider: string | null;
  receiptUrl: string | null;
  createdAt: Date;
}

/**
 * Total trošak jednog servisnog zapisa - partsCost+laborCost za nove
 * zapise, FALLBACK na legacy `cost` polje za stare zapise (nastale prije
 * parts/labor splita, koji imaju partsCost/laborCost = null). Provjerava
 * partsCost ILI laborCost postavljen (ne oba) da razlikuje "novi zapis s
 * jednim od dva polja = 0" od "stari zapis, oba null" - novi zapis uvijek
 * šalje oba polja (vidi serviceRecordCreateSchema), pa je "barem jedno
 * nije null" pouzdan signal da je ovo novi zapis. Export-an jer ga i
 * vehicleStats.ts koristi za period-agregirane brojke (dashboard/per-
 * vehicle profitabilnost/periodični izvještaj).
 */
export function serviceRecordTotal(record: {
  cost: number | null;
  partsCost: number | null;
  laborCost: number | null;
}): number {
  if (record.partsCost != null || record.laborCost != null) {
    return (record.partsCost ?? 0) + (record.laborCost ?? 0);
  }
  return record.cost ?? 0;
}

async function toServiceRecordDTO(record: ServiceRecord): Promise<ServiceRecordDTO> {
  return {
    id: record.id,
    vehicleId: record.vehicleId,
    date: record.date,
    description: record.description,
    partsCost: record.partsCost,
    laborCost: record.laborCost,
    total: serviceRecordTotal(record),
    provider: record.provider,
    receiptUrl: record.receiptKey ? await getPresignedDownloadUrl(record.receiptKey) : null,
    createdAt: record.createdAt,
  };
}

/**
 * Najnovije prvo (po `date`, ne `createdAt`) - vlasnik unosi zapise
 * retroaktivno (npr. stari račun tjedan dana kasnije), pa je datum
 * intervencije relevantniji sortirajući kriterij od trenutka unosa.
 */
export async function listServiceRecordsForVehicle(vehicleId: string): Promise<ServiceRecordDTO[]> {
  const records = await prisma.serviceRecord.findMany({
    where: { vehicleId },
    orderBy: { date: "desc" },
  });
  return Promise.all(records.map(toServiceRecordDTO));
}

export async function createServiceRecord(
  input: ServiceRecordCreateInput & { receiptKey?: string }
): Promise<ServiceRecordDTO> {
  const record = await prisma.serviceRecord.create({ data: input });
  return toServiceRecordDTO(record);
}

export async function deleteServiceRecord(id: string): Promise<void> {
  const record = await prisma.serviceRecord.findUnique({ where: { id } });
  if (!record) return;
  if (record.receiptKey) await deleteObject(record.receiptKey);
  await prisma.serviceRecord.delete({ where: { id } });
}
