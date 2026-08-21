import { NextResponse } from "next/server";
import { extractRegistrationDocFromImage } from "@rent-a-car/api/server";
import { requireOwnerSession } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

// Standalone OCR endpoint (nije vezan na postojeći vehicleId) - koristi se i
// na "Novo vozilo" formi (vozilo još ne postoji) i na uređivanju postojećeg,
// prije nego se prometna stvarno uploada preko `/api/vehicles/[id]/
// registration-doc`. Ne sprema ništa, samo vraća prijedlog polja za prefill
// - vlasnik uvijek pregleda/ispravi prije "Spremi".
export async function POST(request: Request) {
  const auth = await requireOwnerSession(request);
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
    const result = await extractRegistrationDocFromImage(buffer);
    return NextResponse.json(result);
  } catch (err) {
    console.error("OCR extraction failed", err);
    return NextResponse.json({ error: "ocr_failed" }, { status: 502 });
  }
}
