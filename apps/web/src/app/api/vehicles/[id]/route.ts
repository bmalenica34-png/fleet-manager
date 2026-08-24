import { NextResponse } from "next/server";
import { vehicleUpdateSchema } from "@rent-a-car/api";
import { deleteVehicle, getVehicle, updateVehicle } from "@rent-a-car/api/server";
import { zodErrorResponse } from "@/lib/handleZodError";
import { requireModulePermission, requireOwnerSession } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireOwnerSession(request);
  if (!auth.authorized) return auth.response;

  const vehicle = await getVehicle(params.id);
  if (!vehicle) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(vehicle);
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireModulePermission(request, "vehicles");
  if (!auth.authorized) return auth.response;

  const body = await request.json();
  const parsed = vehicleUpdateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const vehicle = await updateVehicle(params.id, parsed.data);
  return NextResponse.json(vehicle);
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireModulePermission(request, "vehicles");
  if (!auth.authorized) return auth.response;

  await deleteVehicle(params.id);
  return NextResponse.json({ ok: true });
}
