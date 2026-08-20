import type { Client, Contract, Vehicle } from "@prisma/client";
import { requiredHandoverAngles, type PhotoAngle, type VehiclePart } from "../schemas/handoverPhoto";
import { prisma } from "../db/client";
import { verifySigningToken } from "../lib/signing-token";
import { buildObjectKey, uploadObject } from "../storage/hetzner";
import { finalizeContractDocuments } from "./documents";

export type SigningResolution =
  | { status: "ok"; contract: Contract & { vehicle: Vehicle; client: Client } }
  | { status: "already_signed" }
  | { status: "invalid" }
  | { status: "expired" };

/**
 * Provjerava signing token bez ikakve autentikacije - JWT potpis/expiry
 * + usporedba s Contract.signingToken u bazi (jednokratnost). "Već
 * potpisano" se prijavljuje odvojeno od "nevažeći" da klijent dobije
 * smislenu poruku umjesto generičke greške.
 */
export async function resolveSigningContract(token: string): Promise<SigningResolution> {
  const verification = verifySigningToken(token);
  if (!verification.valid) {
    return { status: verification.reason === "expired" ? "expired" : "invalid" };
  }
  if (verification.payload.subjectType !== "contract") {
    return { status: "invalid" };
  }

  const contract = await prisma.contract.findUnique({
    where: { id: verification.payload.subjectId },
    include: { vehicle: true, client: true },
  });
  if (!contract) return { status: "invalid" };
  if (contract.status === "signed") return { status: "already_signed" };
  if (contract.signingToken !== token) return { status: "invalid" };

  return { status: "ok", contract };
}

interface UploadedFile {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

export interface CompleteSigningInput {
  phone: string;
  address?: string;
  driverLicense: UploadedFile;
  idDocument: UploadedFile;
  photos: {
    angle: PhotoAngle;
    file: UploadedFile;
    damageDescription?: string;
    damagedPart?: VehiclePart;
  }[];
  signaturePngBuffer: Buffer;
  termsVersion: string;
}

export type CompleteSigningResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "expired" | "already_signed" | "missing_angles" };

/**
 * Atomarno (koliko je moguće preko S3 + DB) dovršava signing flow:
 * upload dokumenata i slika, kreira HandoverPhoto zapise, sprema potpis,
 * te ugovor prebacuje u "signed" i invalidira token (jednokratnost).
 */
export async function completeSigning(
  token: string,
  input: CompleteSigningInput
): Promise<CompleteSigningResult> {
  const resolution = await resolveSigningContract(token);
  if (resolution.status !== "ok") {
    return { ok: false, error: resolution.status };
  }
  const contract = resolution.contract;

  const submittedAngles = new Set(input.photos.map((p) => p.angle));
  const missingAngles = requiredHandoverAngles.filter((angle) => !submittedAngles.has(angle));
  if (missingAngles.length > 0) {
    return { ok: false, error: "missing_angles" };
  }

  const driverLicenseKey = buildObjectKey(
    `clients/${contract.clientId}/driver-license`,
    input.driverLicense.filename
  );
  const idDocumentKey = buildObjectKey(
    `clients/${contract.clientId}/id-document`,
    input.idDocument.filename
  );
  const signatureKey = buildObjectKey(`contracts/${contract.id}/signature`, "signature.png");

  await Promise.all([
    uploadObject({
      key: driverLicenseKey,
      body: input.driverLicense.buffer,
      contentType: input.driverLicense.contentType,
    }),
    uploadObject({
      key: idDocumentKey,
      body: input.idDocument.buffer,
      contentType: input.idDocument.contentType,
    }),
    uploadObject({
      key: signatureKey,
      body: input.signaturePngBuffer,
      contentType: "image/png",
    }),
  ]);

  const photoUploads = await Promise.all(
    input.photos.map(async (photo) => {
      const key = buildObjectKey(
        `contracts/${contract.id}/handover/${photo.angle}`,
        photo.file.filename
      );
      await uploadObject({ key, body: photo.file.buffer, contentType: photo.file.contentType });
      return {
        angle: photo.angle,
        key,
        damageDescription: photo.damageDescription,
        damagedPart: photo.damagedPart,
      };
    })
  );

  await prisma.$transaction([
    prisma.client.update({
      where: { id: contract.clientId },
      data: { phone: input.phone, address: input.address, driverLicenseKey, idDocumentKey },
    }),
    prisma.handoverPhoto.createMany({
      data: photoUploads.map((p) => ({
        contractId: contract.id,
        angle: p.angle,
        key: p.key,
        damageDescription: p.damageDescription,
        damagedPart: p.damagedPart,
      })),
    }),
    prisma.contract.update({
      where: { id: contract.id },
      data: {
        signatureKey,
        signedAt: new Date(),
        status: "signed",
        signingToken: null,
        signingTokenExpiresAt: null,
        // Server-side timestamp (ne klijentski) - pouzdaniji zapis "kad je
        // stvarno primljeno" nego trenutak koji bi klijent mogao poslati.
        termsAcceptedAt: new Date(),
        termsVersion: input.termsVersion,
      },
    }),
  ]);

  try {
    await finalizeContractDocuments(contract.id);
  } catch (err) {
    // Potpis je već pravovaljano spremljen - generacija PDF-a/slanje maila
    // je best-effort nadogradnja i ne smije poništiti sam čin potpisa.
    console.error(`finalizeContractDocuments failed for contract ${contract.id}:`, err);
  }

  return { ok: true };
}
