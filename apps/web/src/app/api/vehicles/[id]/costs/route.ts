import { NextResponse } from "next/server";
import { vehicleCostCreateSchema } from "@rent-a-car/api";
import { createVehicleCost, listVehicleCosts } from "@rent-a-car/api/server";
import { zodErrorResponse } from "@/lib/handleZodError";
import { requireModulePermission, requireOwnerSession } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireOwnerSession(request);
  if (!auth.authorized) return auth.response;

  return NextResponse.json(await listVehicleCosts(params.id));
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireModulePermission(request, "vehicles");
  if (!auth.authorized) return auth.response;

  const body = await request.json();
  const parsed = vehicleCostCreateSchema.safeParse({ ...body, vehicleId: params.id });
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const cost = await createVehicleCost(parsed.data);
  return NextResponse.json(cost, { status: 201 });
}
