import { NextResponse } from "next/server";
import { deleteVehicleCost } from "@rent-a-car/api/server";
import { requireModulePermission } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; costId: string } }
) {
  const auth = await requireModulePermission(request, "vehicles");
  if (!auth.authorized) return auth.response;

  await deleteVehicleCost(params.costId);
  return NextResponse.json({ ok: true });
}
