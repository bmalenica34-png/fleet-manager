import { NextResponse } from "next/server";
import { extractRegistrationInnerFromImage } from "@rent-a-car/api/server";
import { requireModulePermission } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

// Unutarnja strana prometne dozvole (tablica s harmoniziranim EU šiframa) -
// cilj je marka/model/VIN, NIKAD tablice (unutarnja strana ih ne sadrži,
// vidi registration-doc-outer za to). Standalone (nije vezan na postojeći
// vehicleId) - koristi se i na "Novo vozilo" formi prije nego vozilo uopće
// postoji. Ne sprema ništa, samo vraća prijedlog polja za prefill -
// vlasnik uvijek pregleda/ispravi prije "Spremi".
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
    const result = await extractRegistrationInnerFromImage(buffer);
    return NextResponse.json(result);
  } catch (err) {
    console.error("OCR extraction failed (inner)", err);
    return NextResponse.json({ error: "ocr_failed" }, { status: 502 });
  }
}
