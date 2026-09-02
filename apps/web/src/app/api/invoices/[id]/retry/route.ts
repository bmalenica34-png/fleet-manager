import { NextResponse } from "next/server";
import { InvoiceError, retryInvoiceFiscalization } from "@rent-a-car/api/server";
import { requireModulePermission } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

// Ponovni pokušaj fiskalizacije za račun sa `status: failed` - ISTI broj,
// ISTI ZKI (bez rupa u nizu brojeva).
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireModulePermission(request, "invoicing");
  if (!auth.authorized) return auth.response;

  try {
    const invoice = await retryInvoiceFiscalization(params.id);
    return NextResponse.json({ invoice });
  } catch (err) {
    const message =
      err instanceof InvoiceError || err instanceof Error ? err.message : "Greška";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
