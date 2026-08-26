import { NextResponse } from "next/server";
import { serviceRecordCreateSchema } from "@rent-a-car/api";
import {
  buildObjectKey,
  createServiceRecord,
  listServiceRecordsForVehicle,
  uploadObject,
} from "@rent-a-car/api/server";
import { zodErrorResponse } from "@/lib/handleZodError";
import { requireModulePermission, requireOwnerSession } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireOwnerSession(request);
  if (!auth.authorized) return auth.response;

  return NextResponse.json(await listServiceRecordsForVehicle(params.id));
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireModulePermission(request, "vehicles");
  if (!auth.authorized) return auth.response;

  const formData = await request.formData();
  const parsed = serviceRecordCreateSchema.safeParse({
    vehicleId: params.id,
    date: formData.get("date"),
    description: formData.get("description"),
    partsCost: formData.get("partsCost"),
    laborCost: formData.get("laborCost"),
    provider: formData.get("provider") || undefined,
  });
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const file = formData.get("receipt");
  let receiptKey: string | undefined;
  if (file instanceof File) {
    const buffer = Buffer.from(await file.arrayBuffer());
    receiptKey = buildObjectKey(`vehicles/${params.id}/service-records`, file.name);
    await uploadObject({
      key: receiptKey,
      body: buffer,
      contentType: file.type || "application/octet-stream",
    });
  }

  const record = await createServiceRecord({ ...parsed.data, receiptKey });
  return NextResponse.json(record, { status: 201 });
}
