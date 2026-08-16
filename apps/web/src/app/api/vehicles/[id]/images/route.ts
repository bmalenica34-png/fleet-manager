import { NextResponse } from "next/server";
import { addVehicleImage, buildObjectKey, uploadObject } from "@rent-a-car/api/server";
import { requireOwnerSession } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireOwnerSession(request);
  if (!auth.authorized) return auth.response;

  const formData = await request.formData();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "files_required" }, { status: 400 });
  }

  const images = await Promise.all(
    files.map(async (file) => {
      const buffer = Buffer.from(await file.arrayBuffer());
      const key = buildObjectKey(`vehicles/${params.id}/images`, file.name);
      await uploadObject({
        key,
        body: buffer,
        contentType: file.type || "application/octet-stream",
      });
      return addVehicleImage({ vehicleId: params.id, key });
    })
  );

  return NextResponse.json(images, { status: 201 });
}
