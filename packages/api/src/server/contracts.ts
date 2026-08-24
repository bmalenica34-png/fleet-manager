import type { Contract, Client, Vehicle } from "@prisma/client";
import { prisma } from "../db/client";
import { sendContractSigningEmail } from "../lib/email";
import type { ContractCreateInput } from "../schemas/contract";
import { generateSigningToken } from "../lib/signing-token";
import { getPresignedDownloadUrl } from "../storage/hetzner";

function getSigningBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_CLIENT_SIGNING_BASE_URL;
  if (!base) {
    throw new Error("Missing required env var: NEXT_PUBLIC_CLIENT_SIGNING_BASE_URL");
  }
  return base;
}

export type ContractWithRelations = Contract & { vehicle: Vehicle; client: Client };

export async function listContracts(): Promise<ContractWithRelations[]> {
  return prisma.contract.findMany({
    include: { vehicle: true, client: true },
    orderBy: { createdAt: "desc" },
  });
}

export interface ContractAnnexSummary {
  status: "draft" | "sent" | "signed" | "expired";
  newDateTo: Date;
}

export interface ContractPhotoRequestSummary {
  requestedAt: Date;
  fulfilledAt: Date | null;
}

export async function listContractsWithAnnexSummary(): Promise<
  (ContractWithRelations & {
    latestAnnex: ContractAnnexSummary | null;
    latestPhotoRequest: ContractPhotoRequestSummary | null;
  })[]
> {
  const contracts = await prisma.contract.findMany({
    include: {
      vehicle: true,
      client: true,
      annexes: { orderBy: { createdAt: "desc" }, take: 1 },
      photoRequests: { orderBy: { requestedAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  return contracts.map((c: (typeof contracts)[number]) => {
    const { annexes, photoRequests, ...contract } = c;
    return {
      ...contract,
      latestAnnex: annexes[0] ? { status: annexes[0].status, newDateTo: annexes[0].newDateTo } : null,
      latestPhotoRequest: photoRequests[0]
        ? { requestedAt: photoRequests[0].requestedAt, fulfilledAt: photoRequests[0].fulfilledAt }
        : null,
    };
  });
}

export async function getContract(id: string): Promise<ContractWithRelations | null> {
  return prisma.contract.findUnique({
    where: { id },
    include: { vehicle: true, client: true },
  });
}

export type ContractListItemDTO = ContractWithRelations & {
  contractPdfUrl: string | null;
  protocolPdfUrl: string | null;
  latestAnnex: ContractAnnexSummary | null;
  latestPhotoRequest: ContractPhotoRequestSummary | null;
};

async function withDocumentUrls<T extends { contractPdfKey: string | null; protocolPdfKey: string | null }>(
  contract: T
): Promise<T & { contractPdfUrl: string | null; protocolPdfUrl: string | null }> {
  return {
    ...contract,
    contractPdfUrl: contract.contractPdfKey
      ? await getPresignedDownloadUrl(contract.contractPdfKey)
      : null,
    protocolPdfUrl: contract.protocolPdfKey
      ? await getPresignedDownloadUrl(contract.protocolPdfKey)
      : null,
  };
}

export async function listContractsWithDocumentUrls(): Promise<ContractListItemDTO[]> {
  const contracts = await listContractsWithAnnexSummary();
  return Promise.all(contracts.map(withDocumentUrls));
}

/**
 * Ugovori vidljivi ulogiranom klijentu na /portal - filtrirano po
 * Client.userId, ne po emailu (userId se postavlja tek nakon Supabase
 * verifikacije, pa je pouzdaniji filter).
 */
export async function listContractsForClientUser(userId: string): Promise<ContractListItemDTO[]> {
  const contracts = await prisma.contract.findMany({
    where: { client: { userId } },
    include: {
      vehicle: true,
      client: true,
      annexes: { orderBy: { createdAt: "desc" }, take: 1 },
      photoRequests: { orderBy: { requestedAt: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  return Promise.all(
    contracts.map((c: (typeof contracts)[number]) => {
      const { annexes, photoRequests, ...contract } = c;
      return withDocumentUrls({
        ...contract,
        latestAnnex: annexes[0] ? { status: annexes[0].status, newDateTo: annexes[0].newDateTo } : null,
        latestPhotoRequest: photoRequests[0]
          ? { requestedAt: photoRequests[0].requestedAt, fulfilledAt: photoRequests[0].fulfilledAt }
          : null,
      });
    })
  );
}

/**
 * Kreira ugovor u "draft" statusu, generira jednokratan 48h signing token,
 * te šalje mail klijentu s linkom za potpis. Status prelazi u "sent" tek
 * nakon što je mail uspješno poslan.
 */
export type ContractCreatedBy = { kind: "owner"; id: string } | { kind: "employee"; id: string };

export async function createContractAndSendSigningEmail(
  input: ContractCreateInput,
  createdBy?: ContractCreatedBy
): Promise<ContractWithRelations> {
  const [vehicle, client] = await Promise.all([
    prisma.vehicle.findUniqueOrThrow({ where: { id: input.vehicleId } }),
    prisma.client.findUniqueOrThrow({ where: { id: input.clientId } }),
  ]);

  const contract = await prisma.contract.create({
    data: {
      vehicleId: input.vehicleId,
      clientId: input.clientId,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      status: "draft",
      pickupLocation: input.pickupLocation,
      returnLocation: input.returnLocation,
      odometerStart: input.odometerStart,
      odometerEnd: input.odometerEnd,
      pricePerDay: input.pricePerDay,
      excessAmount: input.excessAmount,
      paymentMethod: input.paymentMethod,
      createdByOwnerId: createdBy?.kind === "owner" ? createdBy.id : undefined,
      createdByEmployeeId: createdBy?.kind === "employee" ? createdBy.id : undefined,
    },
  });

  const { token, expiresAt } = generateSigningToken({
    subjectId: contract.id,
    subjectType: "contract",
  });

  const signingUrl = `${getSigningBaseUrl()}/${token}`;

  await sendContractSigningEmail({
    to: client.email,
    clientName: `${client.firstName} ${client.lastName}`,
    vehicleLabel: `${vehicle.make} ${vehicle.model} (${vehicle.licensePlate})`,
    dateFrom: contract.dateFrom,
    dateTo: contract.dateTo,
    signingUrl,
  });

  return prisma.contract.update({
    where: { id: contract.id },
    data: {
      signingToken: token,
      signingTokenExpiresAt: expiresAt,
      status: "sent",
    },
    include: { vehicle: true, client: true },
  });
}
