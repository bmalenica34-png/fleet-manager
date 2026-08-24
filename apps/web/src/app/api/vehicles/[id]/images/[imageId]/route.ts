import { NextResponse } from "next/server";
import { deleteVehicleImage } from "@rent-a-car/api/server";
import { requireModulePermission } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  { params }: { params: { imageId: string } }
) {
  const auth = await requireModulePermission(request, "vehicles");
  if (!auth.authorized) return auth.response;

  await deleteVehicleImage(params.imageId);
  return NextResponse.json({ ok: true });
}
