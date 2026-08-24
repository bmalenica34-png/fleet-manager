import { NextResponse } from "next/server";
import { extractInsurancePolicyFromPdf } from "@rent-a-car/api/server";
import { requireModulePermission } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

// Polica osiguranja - PDF text-parsing (ne Vision OCR), jer je polica
// generirani dokument s pravim tekstualnim slojem, ne fotografija. Cilj je
// datum isteka registracije - NE s prometne (pečat prekriva datum na
// fizičkom dokumentu, korisnikova eksplicitna napomena). Standalone, ne
// sprema ništa, samo vraća prijedlog za prefill.
export async function POST(request: Request) {
  const auth = await requireModulePermission(request, "vehicles");
  if (!auth.authorized) return auth.response;

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_required" }, { status: 400 });
  }
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "pdf_required" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    const result = await extractInsurancePolicyFromPdf(buffer);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Insurance policy PDF parsing failed", err);
    return NextResponse.json({ error: "parse_failed" }, { status: 502 });
  }
}
