import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

let client: S3Client | undefined;

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      endpoint: requiredEnv("HETZNER_S3_ENDPOINT"),
      region: process.env.HETZNER_S3_REGION ?? "eu-central",
      forcePathStyle: true,
      credentials: {
        accessKeyId: requiredEnv("HETZNER_S3_ACCESS_KEY_ID"),
        secretAccessKey: requiredEnv("HETZNER_S3_SECRET_ACCESS_KEY"),
      },
    });
  }
  return client;
}

function getBucket(): string {
  return requiredEnv("HETZNER_S3_BUCKET");
}

/**
 * Gradi jedinstveni object key unutar zadanog "foldera" (prefixa) i čuva
 * originalnu ekstenziju radi content-type inferencije kasnije.
 */
export function buildObjectKey(prefix: string, filename: string): string {
  const ext = filename.includes(".") ? filename.split(".").pop() : undefined;
  const safeExt = ext ? `.${ext.toLowerCase().replace(/[^a-z0-9]/g, "")}` : "";
  return `${prefix}/${randomUUID()}${safeExt}`;
}

export async function uploadObject(params: {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
}): Promise<{ key: string }> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    })
  );
  return { key: params.key };
}

/**
 * Presigned GET URL s kratkim expiryjem. Nikad ne vraćati raw file path
 * na frontend - uvijek kroz ovu funkciju.
 */
export async function getPresignedDownloadUrl(
  key: string,
  expiresInSeconds = 900
): Promise<string> {
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: getBucket(), Key: key }),
    { expiresIn: expiresInSeconds }
  );
}

export async function deleteObject(key: string): Promise<void> {
  await getClient().send(
    new DeleteObjectCommand({ Bucket: getBucket(), Key: key })
  );
}
