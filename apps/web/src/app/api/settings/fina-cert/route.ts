import { NextResponse } from "next/server";
import { setFinaCert } from "@rent-a-car/api/server";
import { requireModulePermission } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

// Upload FINA aplikacijskog certifikata (.p12/.pfx). Multipart: `file` +
// `password`. Cert se sprema kao base64 u CompanySettings, nikad se ne
// vraća natrag frontendu.
export async function POST(request: Request) {
  const auth = await requireModulePermission(request, "settings");
  if (!auth.authorized) return auth.response;

  const formData = await request.formData();
  const file = formData.get("file");
  const password = formData.get("password");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_required" }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");

  return NextResponse.json(
    await setFinaCert(base64, typeof password === "string" ? password : "")
  );
}
