import type { Client, Contract, Vehicle } from "@prisma/client";
import { requiredHandoverAngles, type PhotoAngle, type VehiclePart } from "../schemas/handoverPhoto";
import { prisma } from "../db/client";
import { verifySigningToken } from "../lib/signing-token";
import { buildObjectKey, getPresignedUploadUrl, uploadObject } from "../storage/hetzner";
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

export type SignUploadPurpose = "driverLicense" | "idDocument" | "photo" | "damagePhoto";

function buildSignUploadKey(
  contract: Contract,
  purpose: SignUploadPurpose,
  filename: string,
  angle?: PhotoAngle
): string {
  switch (purpose) {
    case "driverLicense":
      return buildObjectKey(`clients/${contract.clientId}/driver-license`, filename);
    case "idDocument":
      return buildObjectKey(`clients/${contract.clientId}/id-document`, filename);
    case "photo":
      return buildObjectKey(`contracts/${contract.id}/handover/${angle}`, filename);
    case "damagePhoto":
      return buildObjectKey(`contracts/${contract.id}/handover/other`, filename);
  }
}

export type CreateSignUploadUrlResult =
  | { ok: true; key: string; uploadUrl: string }
  | { ok: false; error: "invalid" | "expired" | "already_signed" };

/**
 * Izdaje presigned PUT URL za jedan fajl u signing wizardu - klijent
 * uploada bytes izravno u Hetzner, mimo Vercel funkcijskog tijela (vidi
 * bug #37). Token se provjerava identično kao resolveSigningContract, da
 * netko s isteklim/već iskorištenim/nevažećim tokenom ne može izdavati
 * upload URL-ove.
 */
export async function createSignUploadUrl(
  token: string,
  purpose: SignUploadPurpose,
  filename: string,
  contentType: string,
  angle?: PhotoAngle
): Promise<CreateSignUploadUrlResult> {
  const resolution = await resolveSigningContract(token);
  if (resolution.status !== "ok") {
    return { ok: false, error: resolution.status };
  }
  const key = buildSignUploadKey(resolution.contract, purpose, filename, angle);
  const uploadUrl = await getPresignedUploadUrl(key, contentType);
  return { ok: true, key, uploadUrl };
}

export interface CompleteSigningInput {
  phone: string;
  address?: string;
  driverLicenseKey: string;
  idDocumentKey: string;
  photos: {
    angle: PhotoAngle;
    key: string;
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

  // Dokumenti i slike su već uploadani izravno u Hetzner s klijenta
  // (presigned PUT, vidi createSignUploadUrl) - ovdje samo uploadamo potpis
  // (mali PNG, nema razloga komplicirati flow zbog par KB) i spremamo već
  // dobivene ključeve u bazu.
  const signatureKey = buildObjectKey(`contracts/${contract.id}/signature`, "signature.png");

  await uploadObject({
    key: signatureKey,
    body: input.signaturePngBuffer,
    contentType: "image/png",
  });

  await prisma.$transaction([
    prisma.client.update({
      where: { id: contract.clientId },
      data: {
        phone: input.phone,
        address: input.address,
        driverLicenseKey: input.driverLicenseKey,
        idDocumentKey: input.idDocumentKey,
      },
    }),
    prisma.handoverPhoto.createMany({
      data: input.photos.map((p) => ({
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
