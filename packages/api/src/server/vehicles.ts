import type { Vehicle, VehicleImage } from "@prisma/client";
import { prisma } from "../db/client";
import type {
  VehicleCreateInput,
  VehicleImageCreateInput,
  VehicleUpdateInput,
} from "../schemas/vehicle";
import { deleteObject, getPresignedDownloadUrl } from "../storage/hetzner";

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
  createdAt: Date;
  updatedAt: Date;
}

async function toVehicleDTO(
  vehicle: Vehicle & { images: VehicleImage[] }
): Promise<VehicleDTO> {
  const [registrationDocUrl, insurancePolicyUrl, images] = await Promise.all([
    vehicle.registrationDocKey
      ? getPresignedDownloadUrl(vehicle.registrationDocKey)
      : Promise.resolve(null),
    vehicle.insurancePolicyKey
      ? getPresignedDownloadUrl(vehicle.insurancePolicyKey)
      : Promise.resolve(null),
    Promise.all(
      vehicle.images.map(async (image) => ({
        id: image.id,
        url: await getPresignedDownloadUrl(image.key),
      }))
    ),
  ]);

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
    ...vehicle.images.map((image) => deleteObject(image.key)),
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
