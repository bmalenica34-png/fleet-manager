import { NextResponse } from "next/server";
import {
  InvoiceError,
  issueInvoiceForRentPayment,
  markRentPaymentPaid,
} from "@rent-a-car/api/server";
import { requireModulePermission } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

// Body (opcionalno): { issueInvoice: boolean } - kad je true, nakon
// označavanja plaćenim pokreće fiskalizaciju + generira PDF + šalje mail
// klijentu. Kad je false / izostavljeno: ponašanje kao prije (samo paid=true).
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireModulePermission(request, "invoicing");
  if (!auth.authorized) return auth.response;

  let issueInvoice = false;
  try {
    const body = await request.json();
    issueInvoice = body?.issueInvoice === true;
  } catch {
    // prazan body - ok
  }

  const rentPayment = await markRentPaymentPaid(params.id);

  if (!issueInvoice) {
    return NextResponse.json({ rentPayment });
  }

  try {
    const invoice = await issueInvoiceForRentPayment(params.id);
    return NextResponse.json({ rentPayment, invoice });
  } catch (err) {
    const message =
      err instanceof InvoiceError || err instanceof Error ? err.message : "Greška pri izdavanju računa";
    // Plaćeno JE spremljeno; samo račun nije uspio - 200 s errorom da UI
    // može prikazati poruku bez da izgleda kao da "Plaćeno" nije prošlo.
    return NextResponse.json({ rentPayment, invoiceError: message });
  }
}
