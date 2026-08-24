import { NextResponse } from "next/server";
import { extractRegistrationOuterFromImage } from "@rent-a-car/api/server";
import { requireModulePermission } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

// Vanjska strana prometne dozvole - cilj je ISKLJUČIVO registracijska
// oznaka (tablice), koja je na ovoj strani standardno prikazana veliko i
// jasno. Standalone (nije vezan na postojeći vehicleId), ne sprema ništa,
// samo vraća prijedlog za prefill.
export async function POST(request: Request) {
  const auth = await requireModulePermission(request, "vehicles");
  if (!auth.authorized) return auth.response;

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_required" }, { status: 400 });
  }
  if (file.type === "application/pdf") {
    return NextResponse.json({ error: "pdf_not_supported" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const result = await extractRegistrationOuterFromImage(buffer);
    return NextResponse.json(result);
  } catch (err) {
    console.error("OCR extraction failed (outer)", err);
    return NextResponse.json({ error: "ocr_failed" }, { status: 502 });
  }
}
