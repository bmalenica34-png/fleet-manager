import { NextResponse } from "next/server";
import { completeSigning, resolveSigningContract } from "@rent-a-car/api/server";
import { completeSigningRequestSchema } from "@rent-a-car/api";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: { token: string } }
) {
  const resolution = await resolveSigningContract(params.token);

  if (resolution.status !== "ok") {
    const status = resolution.status === "invalid" ? 404 : 410;
    return NextResponse.json({ status: resolution.status }, { status });
  }

  const { contract } = resolution;
  return NextResponse.json({
    status: "ok",
    contract: {
      id: contract.id,
      dateFrom: contract.dateFrom,
      dateTo: contract.dateTo,
      vehicle: {
        make: contract.vehicle.make,
        model: contract.vehicle.model,
        licensePlate: contract.vehicle.licensePlate,
      },
      client: {
        firstName: contract.client.firstName,
        lastName: contract.client.lastName,
        email: contract.client.email,
        phone: contract.client.phone,
      },
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: { token: string } }
) {
  // Malen JSON umjesto multipart-a - dokumenti/slike su već uploadani
  // izravno u Hetzner s klijenta (vidi /api/sign/[token]/upload-url i bug
  // #37 u PROGRESS.md), ovdje stižu samo ključevi + metapodaci + potpis
  // (mali base64 PNG).
  const json = await request.json().catch(() => null);
  const parsed = completeSigningRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const input = parsed.data;

  const base64 = input.signature.split(",")[1];
  if (!base64) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const result = await completeSigning(params.token, {
    phone: input.phone.trim(),
    address: input.address?.trim() || undefined,
    termsVersion: input.termsVersion,
    driverLicenseKey: input.driverLicenseKey,
    idDocumentKey: input.idDocumentKey,
    photos: [
      ...input.photos.map((p) => ({
        angle: p.angle,
        key: p.key,
        damageDescription: p.damageDescription,
      })),
      ...input.damagePhotos.map((p) => ({
        angle: "other" as const,
        key: p.key,
        damageDescription: p.description,
        damagedPart: p.part,
      })),
    ],
    signaturePngBuffer: Buffer.from(base64, "base64"),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
