import type { Client, Contract, PhotoRequest, Vehicle } from "@prisma/client";
import { prisma } from "../db/client";
import { generateSigningToken, verifySigningToken } from "../lib/signing-token";
import { sendPhotoRequestEmail, sendPhotoRequestFulfilledEmail } from "../lib/email";
import { buildObjectKey, uploadObject } from "../storage/hetzner";
import { requiredHandoverAngles, type PhotoAngle } from "../schemas/handoverPhoto";

function getPhotoRequestBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_CLIENT_SIGNING_BASE_URL;
  if (!base) {
    throw new Error("Missing required env var: NEXT_PUBLIC_CLIENT_SIGNING_BASE_URL");
  }
  // isti base kao signing link, npr. http://localhost:3000/sign -> .../request-photos
  return base.replace(/\/sign$/, "/request-photos");
}

function getOwnerEmail(): string {
  const email = process.env.OWNER_EMAIL;
  if (!email) {
    throw new Error("Missing required env var: OWNER_EMAIL");
  }
  return email;
}

export type PhotoRequestWithRelations = PhotoRequest & {
  contract: Contract & { vehicle: Vehicle; client: Client };
};

/**
 * Owner ručno okine zahtjev za svježe slike bilo kad tijekom aktivnog
 * (potpisanog, tekućeg) najma. Generira jednokratan 48h token i šalje mail
 * klijentu s linkom na isti upload widget kao kod primopredaje, samo bez
 * dokumenata/potpisa.
 */
export async function createPhotoRequestAndSendEmail(contractId: string): Promise<PhotoRequest> {
  const contract = await prisma.contract.findUniqueOrThrow({
    where: { id: contractId },
    include: { vehicle: true, client: true },
  });

  const now = new Date();
  if (contract.status !== "signed" || contract.dateFrom > now || contract.dateTo < now) {
    throw new Error("Zahtjev za slike moguć je samo tijekom aktivnog potpisanog najma.");
  }

  const photoRequest = await prisma.photoRequest.create({
    data: { contractId: contract.id },
  });

  const { token, expiresAt } = generateSigningToken({
    subjectId: photoRequest.id,
    subjectType: "photo_request",
  });

  const requestUrl = `${getPhotoRequestBaseUrl()}/${token}`;

  await sendPhotoRequestEmail({
    to: contract.client.email,
    clientName: `${contract.client.firstName} ${contract.client.lastName}`,
    vehicleLabel: `${contract.vehicle.make} ${contract.vehicle.model} (${contract.vehicle.licensePlate})`,
    requestUrl,
  });

  return prisma.photoRequest.update({
    where: { id: photoRequest.id },
    data: { requestToken: token, requestTokenExpiresAt: expiresAt },
  });
}

export type PhotoRequestResolution =
  | { status: "ok"; photoRequest: PhotoRequestWithRelations }
  | { status: "already_fulfilled" }
  | { status: "invalid" }
  | { status: "expired" };

export async function resolvePhotoRequest(token: string): Promise<PhotoRequestResolution> {
  const verification = verifySigningToken(token);
  if (!verification.valid) {
    return { status: verification.reason === "expired" ? "expired" : "invalid" };
  }
  if (verification.payload.subjectType !== "photo_request") {
    return { status: "invalid" };
  }

  const photoRequest = await prisma.photoRequest.findUnique({
    where: { id: verification.payload.subjectId },
    include: { contract: { include: { vehicle: true, client: true } } },
  });
  if (!photoRequest) return { status: "invalid" };
  if (photoRequest.fulfilledAt) return { status: "already_fulfilled" };
  if (photoRequest.requestToken !== token) return { status: "invalid" };

  return { status: "ok", photoRequest };
}

interface UploadedFile {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

export interface CompletePhotoRequestInput {
  photos: { angle: PhotoAngle; file: UploadedFile; damageDescription?: string }[];
}

export type CompletePhotoRequestResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "expired" | "already_fulfilled" | "missing_angles" };

/**
 * Sprema uploadane slike kao HandoverPhoto (vezane i na contractId i na
 * photoRequestId), označava zahtjev ispunjenim i invalidira token
 * (jednokratan). Šalje potvrdu vlasniku - best-effort, ne ruši uspješan
 * upload ako mail padne.
 */
export async function completePhotoRequest(
  token: string,
  input: CompletePhotoRequestInput
): Promise<CompletePhotoRequestResult> {
  const resolution = await resolvePhotoRequest(token);
  if (resolution.status !== "ok") {
    return { ok: false, error: resolution.status };
  }
  const photoRequest = resolution.photoRequest;
  const contract = photoRequest.contract;

  const submittedAngles = new Set(input.photos.map((p) => p.angle));
  const missingAngles = requiredHandoverAngles.filter((angle) => !submittedAngles.has(angle));
  if (missingAngles.length > 0) {
    return { ok: false, error: "missing_angles" };
  }

  const photoUploads = await Promise.all(
    input.photos.map(async (photo) => {
      const key = buildObjectKey(
        `contracts/${contract.id}/photo-requests/${photoRequest.id}/${photo.angle}`,
        photo.file.filename
      );
      await uploadObject({ key, body: photo.file.buffer, contentType: photo.file.contentType });
      return { angle: photo.angle, key, damageDescription: photo.damageDescription };
    })
  );

  await prisma.$transaction([
    prisma.handoverPhoto.createMany({
      data: photoUploads.map((p) => ({
        contractId: contract.id,
        photoRequestId: photoRequest.id,
        angle: p.angle,
        key: p.key,
        damageDescription: p.damageDescription,
      })),
    }),
    prisma.photoRequest.update({
      where: { id: photoRequest.id },
      data: { fulfilledAt: new Date(), requestToken: null, requestTokenExpiresAt: null },
    }),
  ]);

  try {
    await sendPhotoRequestFulfilledEmail({
      to: getOwnerEmail(),
      vehicleLabel: `${contract.vehicle.make} ${contract.vehicle.model} (${contract.vehicle.licensePlate})`,
      clientName: `${contract.client.firstName} ${contract.client.lastName}`,
    });
  } catch (err) {
    console.error(`sendPhotoRequestFulfilledEmail failed for photoRequest ${photoRequest.id}:`, err);
  }

  return { ok: true };
}
