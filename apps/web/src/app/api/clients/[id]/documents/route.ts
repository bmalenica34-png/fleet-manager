import { NextResponse } from "next/server";
import { clientDocumentSlotSchema } from "@rent-a-car/api";
import { buildObjectKey, setClientDocument, uploadObject } from "@rent-a-car/api/server";
import { requireModulePermission } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireModulePermission(request, "clients");
  if (!auth.authorized) return auth.response;

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_required" }, { status: 400 });
  }

  const parsedSlot = clientDocumentSlotSchema.safeParse(formData.get("slot"));
  if (!parsedSlot.success) {
    return NextResponse.json({ error: "invalid_slot" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = buildObjectKey(`clients/${params.id}/documents/${parsedSlot.data}`, file.name);
  await uploadObject({
    key,
    body: buffer,
    contentType: file.type || "application/octet-stream",
  });

  const client = await setClientDocument(params.id, parsedSlot.data, key);
  return NextResponse.json(client);
}
