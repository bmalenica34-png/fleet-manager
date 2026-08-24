import { NextResponse } from "next/server";
import { buildObjectKey, setCompanyLogo, uploadObject } from "@rent-a-car/api/server";
import { requireModulePermission } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireModulePermission(request, "settings");
  if (!auth.authorized) return auth.response;

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_required" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = buildObjectKey("company/logo", file.name);
  await uploadObject({
    key,
    body: buffer,
    contentType: file.type || "application/octet-stream",
  });

  return NextResponse.json(await setCompanyLogo(key));
}
