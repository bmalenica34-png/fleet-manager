import { NextResponse } from "next/server";
import { vehicleCreateSchema } from "@rent-a-car/api";
import { createVehicle, listVehicles } from "@rent-a-car/api/server";
import { zodErrorResponse } from "@/lib/handleZodError";
import { requireOwnerSession } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireOwnerSession(request);
  if (!auth.authorized) return auth.response;

  const vehicles = await listVehicles();
  return NextResponse.json(vehicles);
}

export async function POST(request: Request) {
  const auth = await requireOwnerSession(request);
  if (!auth.authorized) return auth.response;

  const body = await request.json();
  const parsed = vehicleCreateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const vehicle = await createVehicle(parsed.data);
  return NextResponse.json(vehicle, { status: 201 });
}
