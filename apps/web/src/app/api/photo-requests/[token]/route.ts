import { NextResponse } from "next/server";
import { completePhotoRequest, resolvePhotoRequest } from "@rent-a-car/api/server";
import { completePhotoRequestRequestSchema } from "@rent-a-car/api";

export const runtime = "nodejs";

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
  // Malen JSON umjesto multipart-a - slike su već uploadane izravno u
  // Hetzner s klijenta (vidi /api/photo-requests/[token]/upload-url i
  // bugove #37/#38 u PROGRESS.md).
  const json = await request.json().catch(() => null);
  const parsed = completePhotoRequestRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const result = await completePhotoRequest(params.token, { photos: parsed.data.photos });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
