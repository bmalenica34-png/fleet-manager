import { NextResponse } from "next/server";
import { deleteServiceRecord } from "@rent-a-car/api/server";
import { requireModulePermission } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; recordId: string } }
) {
  const auth = await requireModulePermission(request, "vehicles");
  if (!auth.authorized) return auth.response;

  await deleteServiceRecord(params.recordId);
  return NextResponse.json({ ok: true });
}
