import { NextResponse } from "next/server";
import { completeAnnexSigning, resolveAnnexSigning } from "@rent-a-car/api/server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: { token: string } }
) {
  const resolution = await resolveAnnexSigning(params.token);

  if (resolution.status !== "ok") {
    const status = resolution.status === "invalid" ? 404 : 410;
    return NextResponse.json({ status: resolution.status }, { status });
  }

  const { annex } = resolution;
  const contract = annex.parentContract;
  return NextResponse.json({
    status: "ok",
    annex: {
      currentDateTo: contract.dateTo,
      proposedNewDateTo: annex.newDateTo,
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
  const body = await request.json();
  const { newDateTo, signature } = body;

  if (typeof newDateTo !== "string" || typeof signature !== "string") {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const base64 = signature.split(",")[1];
  if (!base64) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const result = await completeAnnexSigning(params.token, {
    newDateTo: new Date(newDateTo),
    signaturePngBuffer: Buffer.from(base64, "base64"),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
