import type { ServiceRecord } from "@prisma/client";
import { prisma } from "../db/client";
import type { ServiceRecordCreateInput } from "../schemas/serviceRecord";
import { deleteObject, getPresignedDownloadUrl } from "../storage/hetzner";

export interface ServiceRecordDTO {
  id: string;
  vehicleId: string;
  date: Date;
  description: string;
  cost: number;
  provider: string | null;
  receiptUrl: string | null;
  createdAt: Date;
}

async function toServiceRecordDTO(record: ServiceRecord): Promise<ServiceRecordDTO> {
  return {
    id: record.id,
    vehicleId: record.vehicleId,
    date: record.date,
    description: record.description,
    cost: record.cost,
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
