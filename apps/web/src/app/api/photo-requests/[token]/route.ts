import { NextResponse } from "next/server";
import { completePhotoRequest, resolvePhotoRequest } from "@rent-a-car/api/server";
import type { PhotoAngle } from "@rent-a-car/api";

export const runtime = "nodejs";

const REQUIRED_ANGLES: PhotoAngle[] = ["front", "back", "left", "right"];

export async function GET(
  _request: Request,
  { params }: { params: { token: string } }
) {
  const resolution = await resolvePhotoRequest(params.token);

  if (resolution.status !== "ok") {
    const status = resolution.status === "invalid" ? 404 : 410;
    return NextResponse.json({ status: resolution.status }, { status });
  }

  const { contract } = resolution.photoRequest;
  return NextResponse.json({
    status: "ok",
    photoRequest: {
      vehicle: {
        make: contract.vehicle.make,
        model: contract.vehicle.model,
        licensePlate: contract.vehicle.licensePlate,
      },
      client: {
        firstName: contract.client.firstName,
        lastName: contract.client.lastName,
      },
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: { token: string } }
) {
  const formData = await request.formData();

  const photos: {
    angle: PhotoAngle;
    file: { buffer: Buffer; contentType: string; filename: string };
    damageDescription?: string;
  }[] = [];

  for (const angle of REQUIRED_ANGLES) {
    const file = formData.get(`photo_${angle}`);
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "missing_photo", angle }, { status: 400 });
    }
    const damage = formData.get(`damage_${angle}`);
    photos.push({
      angle,
      file: {
        buffer: Buffer.from(await file.arrayBuffer()),
        contentType: file.type || "image/jpeg",
        filename: file.name,
      },
      damageDescription: typeof damage === "string" && damage.trim() ? damage.trim() : undefined,
    });
  }

  const result = await completePhotoRequest(params.token, { photos });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
