import type { Annex, Client, Contract, Vehicle } from "@prisma/client";
import { prisma } from "../db/client";
import { generateSigningToken, verifySigningToken } from "../lib/signing-token";
import { sendAnnexSigningEmail, sendSignedAnnexEmail } from "../lib/email";
import { buildObjectKey, getPresignedDownloadUrl, uploadObject } from "../storage/hetzner";
import { renderAnnexPdf } from "../pdf/generate";
import { extendRentPaymentsForContract } from "./rentPayments";

function getExtendBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_CLIENT_SIGNING_BASE_URL;
  if (!base) {
    throw new Error("Missing required env var: NEXT_PUBLIC_CLIENT_SIGNING_BASE_URL");
  }
  // isti base kao signing link, npr. http://localhost:3000/sign -> .../extend
  return base.replace(/\/sign$/, "/extend");
}

function getOwnerEmail(): string {
  const email = process.env.OWNER_EMAIL;
  if (!email) {
    throw new Error("Missing required env var: OWNER_EMAIL");
  }
  return email;
}

export type AnnexWithRelations = Annex & {
  parentContract: Contract & { vehicle: Vehicle; client: Client };
};

/**
 * Kreira Annex u "draft" statusu s predloženim novim datumom povrata,
 * generira jednokratan 48h signing token, i šalje mail klijentu s linkom
 * za lakši signing flow (bez re-uploada dokumenata). Status prelazi u
 * "sent" tek nakon uspješno poslanog maila.
 */
export async function createAnnexAndSendSigningEmail(
  contractId: string,
  proposedNewDateTo: Date
): Promise<Annex> {
  const contract = await prisma.contract.findUniqueOrThrow({
    where: { id: contractId },
    include: { vehicle: true, client: true },
  });

  const annex = await prisma.annex.create({
    data: {
      parentContractId: contract.id,
      newDateTo: proposedNewDateTo,
      status: "draft",
    },
  });

  const { token, expiresAt } = generateSigningToken({
    subjectId: annex.id,
    subjectType: "annex",
  });

  const extendUrl = `${getExtendBaseUrl()}/${token}`;

  await sendAnnexSigningEmail({
    to: contract.client.email,
    clientName: `${contract.client.firstName} ${contract.client.lastName}`,
    vehicleLabel: `${contract.vehicle.make} ${contract.vehicle.model} (${contract.vehicle.licensePlate})`,
    currentDateTo: contract.dateTo,
    proposedNewDateTo,
    extendUrl,
  });

  return prisma.annex.update({
    where: { id: annex.id },
    data: { signingToken: token, signingTokenExpiresAt: expiresAt, status: "sent" },
  });
}

export type AnnexResolution =
  | { status: "ok"; annex: AnnexWithRelations }
  | { status: "already_signed" }
  | { status: "invalid" }
  | { status: "expired" };

export async function resolveAnnexSigning(token: string): Promise<AnnexResolution> {
  const verification = verifySigningToken(token);
  if (!verification.valid) {
    return { status: verification.reason === "expired" ? "expired" : "invalid" };
  }
  if (verification.payload.subjectType !== "annex") {
    return { status: "invalid" };
  }

  const annex = await prisma.annex.findUnique({
    where: { id: verification.payload.subjectId },
    include: { parentContract: { include: { vehicle: true, client: true } } },
  });
  if (!annex) return { status: "invalid" };
  if (annex.status === "signed") return { status: "already_signed" };
  if (annex.signingToken !== token) return { status: "invalid" };

  return { status: "ok", annex };
}

export interface CompleteAnnexSigningInput {
  newDateTo: Date;
  signaturePngBuffer: Buffer;
}

export type CompleteAnnexSigningResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "expired" | "already_signed" };

/**
 * Dovršava anex signing: sprema potpis, ugovor produžuje (Contract.dateTo
 * se ažurira na novi datum), generira jednostavan anex PDF, šalje mail
 * objema stranama. Bez re-uploada vozačke/osobne/slika - koristi postojeće
 * podatke klijenta.
 */
export async function completeAnnexSigning(
  token: string,
  input: CompleteAnnexSigningInput
): Promise<CompleteAnnexSigningResult> {
  const resolution = await resolveAnnexSigning(token);
  if (resolution.status !== "ok") {
    return { ok: false, error: resolution.status };
  }
  const annex = resolution.annex;
  const contract = annex.parentContract;

  await prisma.$transaction([
    prisma.annex.update({
      where: { id: annex.id },
      data: {
        newDateTo: input.newDateTo,
        signedAt: new Date(),
        status: "signed",
        signingToken: null,
        signingTokenExpiresAt: null,
      },
    }),
    prisma.contract.update({
      where: { id: contract.id },
      data: { dateTo: input.newDateTo },
    }),
  ]);

  // Generira RentPayment periode SAMO za produljeni dio (no-op za "daily")
  // - vidi server/rentPayments.ts. contract.dateTo je ovdje i dalje STARA
  // vrijednost (annex.parentContract je dohvaćen prije gornjeg update-a).
  await extendRentPaymentsForContract(contract, contract.dateTo, input.newDateTo);

  try {
    const signatureKey = buildObjectKey(`annexes/${annex.id}/signature`, "signature.png");
    await uploadObject({
      key: signatureKey,
      body: input.signaturePngBuffer,
      contentType: "image/png",
    });

    const annexPdfBuffer = await renderAnnexPdf({
      annex: { id: annex.id, newDateTo: input.newDateTo, signedAt: new Date() },
      contract: {
        id: contract.id,
        number: contract.number,
        dateFrom: contract.dateFrom,
        previousDateTo: contract.dateTo,
      },
      vehicle: {
        make: contract.vehicle.make,
        model: contract.vehicle.model,
        licensePlate: contract.vehicle.licensePlate,
      },
      client: { firstName: contract.client.firstName, lastName: contract.client.lastName },
      signatureUrl: await getPresignedDownloadUrl(signatureKey, 3600),
    });

    const annexPdfKey = buildObjectKey(`annexes/${annex.id}/documents`, "aneks.pdf");
    await uploadObject({ key: annexPdfKey, body: annexPdfBuffer, contentType: "application/pdf" });
    await prisma.annex.update({ where: { id: annex.id }, data: { annexPdfKey } });

    const vehicleLabel = `${contract.vehicle.make} ${contract.vehicle.model} (${contract.vehicle.licensePlate})`;
    await Promise.all([
      sendSignedAnnexEmail({
        to: contract.client.email,
        recipientName: `${contract.client.firstName} ${contract.client.lastName}`,
        vehicleLabel,
        newDateTo: input.newDateTo,
        annexPdf: annexPdfBuffer,
      }),
      sendSignedAnnexEmail({
        to: getOwnerEmail(),
        recipientName: "Owner",
        vehicleLabel,
        newDateTo: input.newDateTo,
        annexPdf: annexPdfBuffer,
      }),
    ]);
  } catch (err) {
    console.error(`Annex PDF/email failed for annex ${annex.id}:`, err);
  }

  return { ok: true };
}
