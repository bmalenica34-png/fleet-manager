import { NextResponse } from "next/server";
import {
  buildObjectKey,
  setVehicleInsurancePolicy,
  uploadObject,
} from "@rent-a-car/api/server";
import { requireOwnerSession } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireOwnerSession(request);
  if (!auth.authorized) return auth.response;

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_required" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = buildObjectKey(`vehicles/${params.id}/insurance`, file.name);
  await uploadObject({
    key,
    body: buffer,
    contentType: file.type || "application/octet-stream",
  });

  const vehicle = await setVehicleInsurancePolicy(params.id, key);
  return NextResponse.json(vehicle);
}
