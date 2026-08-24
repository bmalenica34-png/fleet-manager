import type { Vehicle, VehicleImage } from "@prisma/client";
import { prisma } from "../db/client";
import type {
  VehicleCreateInput,
  VehicleImageCreateInput,
  VehicleUpdateInput,
} from "../schemas/vehicle";
import { deleteObject, getPresignedDownloadUrl } from "../storage/hetzner";
import { parseHrDateToIso } from "../lib/dateFormat";
import { findCurrentContractForVehicle } from "./contracts";

// "on_service" nadjačava sve ostalo (ručni toggle, vidi Vehicle.underService
// u schema.prisma). "rented"/"available" su izvedeni iz postojanja tekućeg
// ugovora (findCurrentContractForVehicle u ./contracts - ISTI upit koji
// koristi i blokada duplog ugovora kod kreiranja, da definicija "pod
// ugovorom" ostane dosljedna na oba mjesta).
export type VehicleStatus = "on_service" | "rented" | "available";

export interface VehicleDTO {
  id: string;
  make: string;
  model: string;
  year: number | null;
  licensePlate: string;
  vin: string | null;
  registrationDocUrl: string | null;
  registrationExpiresAt: Date | null;
  insurancePolicyUrl: string | null;
  images: { id: string; url: string }[];
  hasIncompleteData: boolean;
  incompleteReasons: string[];
  underService: boolean;
  status: VehicleStatus;
  createdAt: Date;
  updatedAt: Date;
}

async function toVehicleDTO(
  vehicle: Vehicle & { images: VehicleImage[] }
): Promise<VehicleDTO> {
  const [registrationDocUrl, insurancePolicyUrl, images, currentContract] = await Promise.all([
    vehicle.registrationDocKey
      ? getPresignedDownloadUrl(vehicle.registrationDocKey)
      : Promise.resolve(null),
    vehicle.insurancePolicyKey
      ? getPresignedDownloadUrl(vehicle.insurancePolicyKey)
      : Promise.resolve(null),
    Promise.all(
      vehicle.images.map(async (image: VehicleImage) => ({
        id: image.id,
        url: await getPresignedDownloadUrl(image.key),
      }))
    ),
    // Nepotrebno pitati bazu ako je vozilo na servisu - taj status svejedno
    // nadjačava rezultat.
    vehicle.underService ? Promise.resolve(null) : findCurrentContractForVehicle(vehicle.id),
  ]);

  const status: VehicleStatus = vehicle.underService
    ? "on_service"
    : currentContract
      ? "rented"
      : "available";

  return {
    id: vehicle.id,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    licensePlate: vehicle.licensePlate,
    vin: vehicle.vin,
    registrationDocUrl,
    registrationExpiresAt: vehicle.registrationExpiresAt,
    insurancePolicyUrl,
    images,
    hasIncompleteData: vehicle.hasIncompleteData,
    incompleteReasons: vehicle.incompleteReasons,
    underService: vehicle.underService,
    status,
    createdAt: vehicle.createdAt,
    updatedAt: vehicle.updatedAt,
  };
}

export async function listVehicles(): Promise<VehicleDTO[]> {
  const vehicles = await prisma.vehicle.findMany({
    include: { images: true },
    orderBy: { createdAt: "desc" },
  });
  return Promise.all(vehicles.map(toVehicleDTO));
}

export async function getVehicle(id: string): Promise<VehicleDTO | null> {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: { images: true },
  });
  if (!vehicle) return null;
  return toVehicleDTO(vehicle);
}

export async function createVehicle(input: VehicleCreateInput): Promise<VehicleDTO> {
  const vehicle = await prisma.vehicle.create({
    data: input,
    include: { images: true },
  });
  return toVehicleDTO(vehicle);
}

export async function updateVehicle(
  id: string,
  input: VehicleUpdateInput
): Promise<VehicleDTO> {
  const vehicle = await prisma.vehicle.update({
    where: { id },
    data: input,
    include: { images: true },
  });
  return toVehicleDTO(vehicle);
}

export async function deleteVehicle(id: string): Promise<void> {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: { images: true },
  });
  if (!vehicle) return;

  await Promise.all([
    ...vehicle.images.map((image: VehicleImage) => deleteObject(image.key)),
    vehicle.registrationDocKey ? deleteObject(vehicle.registrationDocKey) : Promise.resolve(),
    vehicle.insurancePolicyKey ? deleteObject(vehicle.insurancePolicyKey) : Promise.resolve(),
  ]);

  await prisma.vehicle.delete({ where: { id } });
}

export async function setVehicleRegistrationDoc(
  vehicleId: string,
  key: string
): Promise<VehicleDTO> {
  const existing = await prisma.vehicle.findUniqueOrThrow({
    where: { id: vehicleId },
  });
  if (existing.registrationDocKey) {
    await deleteObject(existing.registrationDocKey);
  }
  const vehicle = await prisma.vehicle.update({
    where: { id: vehicleId },
    data: { registrationDocKey: key },
    include: { images: true },
  });
  return toVehicleDTO(vehicle);
}

export async function setVehicleInsurancePolicy(
  vehicleId: string,
  key: string
): Promise<VehicleDTO> {
  const existing = await prisma.vehicle.findUniqueOrThrow({
    where: { id: vehicleId },
  });
  if (existing.insurancePolicyKey) {
    await deleteObject(existing.insurancePolicyKey);
  }
  const vehicle = await prisma.vehicle.update({
    where: { id: vehicleId },
    data: { insurancePolicyKey: key },
    include: { images: true },
  });
  return toVehicleDTO(vehicle);
}

export async function addVehicleImage(
  input: VehicleImageCreateInput
): Promise<{ id: string; url: string }> {
  const image = await prisma.vehicleImage.create({ data: input });
  return { id: image.id, url: await getPresignedDownloadUrl(image.key) };
}

export async function deleteVehicleImage(id: string): Promise<void> {
  const image = await prisma.vehicleImage.findUnique({ where: { id } });
  if (!image) return;
  await deleteObject(image.key);
  await prisma.vehicleImage.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// CSV bulk import - vidi PROGRESS.md za pun opis pravila. Ukratko: red se
// UVIJEK kreira (i s nedostajućim/lošim poljima, koja se bilježe u
// incompleteReasons) OSIM kad je registarska tablica prazna (shema
// zahtijeva NOT NULL+UNIQUE, nema smislenog placeholdera) ili kad VIN/
// tablica već postoje na drugom vozilu (pravi duplikat, ne "nepotpun
// podatak") - ta dva slučaja se preskaču i prijavljuju kao greška retka.
// ---------------------------------------------------------------------------

const PLACEHOLDER = "Nepoznato";
const MIN_YEAR = 1950;

export interface VehicleCsvImportedRow {
  rowNumber: number;
  vehicleId: string;
  make: string;
  model: string;
  licensePlate: string;
  incomplete: boolean;
  reasons: string[];
}

export interface VehicleCsvSkippedRow {
  rowNumber: number;
  reason: string;
}

export interface VehicleCsvImportResult {
  importedCount: number;
  incompleteCount: number;
  skippedCount: number;
  imported: VehicleCsvImportedRow[];
  skipped: VehicleCsvSkippedRow[];
}

function csvField(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value) return value.trim();
  }
  return "";
}

/**
 * `rows` dolazi iz parseCsv() - ključevi su lowercase zaglavlja iz CSV-a.
 * Prihvaća i hrvatske nazive iz predloška ("marka", "registarska tablica"...)
 * i engleske field-name ekvivalente (za robusnost ako netko preimenuje
 * zaglavlja u nekom alatu).
 */
export async function importVehiclesFromCsvRows(
  rows: Record<string, string>[]
): Promise<VehicleCsvImportResult> {
  const currentYear = new Date().getFullYear();
  const seenPlates = new Set<string>();
  const seenVins = new Set<string>();

  const imported: VehicleCsvImportedRow[] = [];
  const skipped: VehicleCsvSkippedRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 2; // 1-indeksirano + preskoči header red
    const row = rows[i];

    const licensePlate = csvField(row, "registarska tablica", "licenseplate", "license plate");
    if (!licensePlate) {
      skipped.push({
        rowNumber,
        reason: "Nedostaje registarska tablica (obavezno polje - vozilo se ne može uvesti bez njega)",
      });
      continue;
    }

    const plateKey = licensePlate.toLowerCase();
    if (seenPlates.has(plateKey)) {
      skipped.push({ rowNumber, reason: `Duplikat registarske tablice unutar CSV datoteke (${licensePlate})` });
      continue;
    }
    const existingByPlate = await prisma.vehicle.findFirst({
      where: { licensePlate: { equals: licensePlate, mode: "insensitive" } },
    });
    if (existingByPlate) {
      skipped.push({ rowNumber, reason: `Registarska tablica ${licensePlate} već postoji u bazi` });
      continue;
    }

    const vinRaw = csvField(row, "vin");
    const vin = vinRaw || null;
    if (vin) {
      const vinKey = vin.toLowerCase();
      if (seenVins.has(vinKey)) {
        skipped.push({ rowNumber, reason: `Duplikat VIN-a unutar CSV datoteke (${vin})` });
        continue;
      }
      const existingByVin = await prisma.vehicle.findFirst({
        where: { vin: { equals: vin, mode: "insensitive" } },
      });
      if (existingByVin) {
        skipped.push({
          rowNumber,
          reason: `VIN ${vin} već postoji u bazi (vozilo ${existingByVin.licensePlate})`,
        });
        continue;
      }
    }

    const reasons: string[] = [];

    const makeRaw = csvField(row, "marka", "make");
    if (!makeRaw) reasons.push("Nedostaje marka");
    const make = makeRaw || PLACEHOLDER;

    const modelRaw = csvField(row, "model");
    if (!modelRaw) reasons.push("Nedostaje model");
    const model = modelRaw || PLACEHOLDER;

    const yearRaw = csvField(row, "godina", "year");
    let year: number | undefined;
    if (!yearRaw) {
      reasons.push("Nedostaje godina");
    } else {
      const parsed = Number(yearRaw);
      if (Number.isInteger(parsed) && parsed >= MIN_YEAR && parsed <= currentYear + 1) {
        year = parsed;
      } else {
        reasons.push(`Neispravna godina ("${yearRaw}")`);
      }
    }

    if (!vin) reasons.push("Nedostaje VIN");

    const expiresRaw = csvField(row, "istek registracije", "registrationexpiresat");
    let registrationExpiresAt: Date | undefined;
    if (!expiresRaw) {
      reasons.push("Nedostaje datum isteka registracije");
    } else {
      const iso = parseHrDateToIso(expiresRaw);
      if (iso) {
        registrationExpiresAt = new Date(iso);
      } else {
        reasons.push(`Neispravan format datuma isteka registracije ("${expiresRaw}", očekivan DD.MM.GGGG.)`);
      }
    }

    const vehicle = await prisma.vehicle.create({
      data: {
        make,
        model,
        year,
        vin,
        licensePlate,
        registrationExpiresAt,
        hasIncompleteData: reasons.length > 0,
        incompleteReasons: reasons,
      },
    });

    seenPlates.add(plateKey);
    if (vin) seenVins.add(vin.toLowerCase());

    imported.push({
      rowNumber,
      vehicleId: vehicle.id,
      make: vehicle.make,
      model: vehicle.model,
      licensePlate: vehicle.licensePlate,
      incomplete: reasons.length > 0,
      reasons,
    });
  }

  return {
    importedCount: imported.length,
    incompleteCount: imported.filter((v) => v.incomplete).length,
    skippedCount: skipped.length,
    imported,
    skipped,
  };
}
