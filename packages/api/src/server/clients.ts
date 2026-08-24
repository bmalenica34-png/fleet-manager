import type { Client } from "@prisma/client";
import { prisma } from "../db/client";
import type { ClientCreateInput, ClientDocumentSlot, ClientUpdateInput } from "../schemas/client";
import { deleteObject, getPresignedDownloadUrl } from "../storage/hetzner";

export async function listClients(): Promise<Client[]> {
  return prisma.client.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getClient(id: string): Promise<Client | null> {
  return prisma.client.findUnique({ where: { id } });
}

export async function createClient(input: ClientCreateInput): Promise<Client> {
  return prisma.client.create({ data: input });
}

export async function updateClient(
  id: string,
  input: ClientUpdateInput
): Promise<Client> {
  return prisma.client.update({ where: { id }, data: input });
}

// ---------------------------------------------------------------------------
// Dokumenti (osobna + vozačka, prednja/stražnja) - vidi schema.prisma
// komentar na Client za zašto driverLicenseKey/idDocumentKey (signing
// wizard) ostaju odvojeni od *FrontKey/*BackKey (upravljano sa stranice
// klijenta).
// ---------------------------------------------------------------------------

const SLOT_FIELD: Record<ClientDocumentSlot, keyof Client> = {
  idDocumentFront: "idDocumentFrontKey",
  idDocumentBack: "idDocumentBackKey",
  driverLicenseFront: "driverLicenseFrontKey",
  driverLicenseBack: "driverLicenseBackKey",
};

export interface ClientDTO {
  id: string;
  firstName: string;
  lastName: string;
  oib: string;
  email: string;
  phone: string;
  address: string | null;
  idDocumentFrontUrl: string | null;
  idDocumentBackUrl: string | null;
  driverLicenseFrontUrl: string | null;
  driverLicenseBackUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

async function toClientDTO(client: Client): Promise<ClientDTO> {
  // "Prednja strana" broji se kao prisutna i ako klijent ima samo stariji
  // signing-wizard scan (driverLicenseKey/idDocumentKey) - vidi schema.prisma
  // komentar. Nema takvog fallbacka za stražnju stranu (ta nikad nije
  // postojala prije ove promjene).
  const idFrontKey = client.idDocumentFrontKey ?? client.idDocumentKey;
  const licenseFrontKey = client.driverLicenseFrontKey ?? client.driverLicenseKey;

  const [idDocumentFrontUrl, idDocumentBackUrl, driverLicenseFrontUrl, driverLicenseBackUrl] =
    await Promise.all([
      idFrontKey ? getPresignedDownloadUrl(idFrontKey) : Promise.resolve(null),
      client.idDocumentBackKey ? getPresignedDownloadUrl(client.idDocumentBackKey) : Promise.resolve(null),
      licenseFrontKey ? getPresignedDownloadUrl(licenseFrontKey) : Promise.resolve(null),
      client.driverLicenseBackKey
        ? getPresignedDownloadUrl(client.driverLicenseBackKey)
        : Promise.resolve(null),
    ]);

  return {
    id: client.id,
    firstName: client.firstName,
    lastName: client.lastName,
    oib: client.oib,
    email: client.email,
    phone: client.phone,
    address: client.address,
    idDocumentFrontUrl,
    idDocumentBackUrl,
    driverLicenseFrontUrl,
    driverLicenseBackUrl,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  };
}

export async function getClientWithDocuments(id: string): Promise<ClientDTO | null> {
  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) return null;
  return toClientDTO(client);
}

export async function setClientDocument(
  clientId: string,
  slot: ClientDocumentSlot,
  key: string
): Promise<ClientDTO> {
  const field = SLOT_FIELD[slot];
  const existing = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  const oldKey = existing[field] as string | null;
  if (oldKey) {
    await deleteObject(oldKey);
  }
  const client = await prisma.client.update({
    where: { id: clientId },
    data: { [field]: key },
  });
  return toClientDTO(client);
}
