import { NextResponse } from "next/server";
import { getInvoicePdfUrl } from "@rent-a-car/api/server";
import { requireModulePermission } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

// Vraća presigned URL (kratki expiry) na PDF računa - frontend otvara u
// novom tabu. Ne streamamo kroz Next da izbjegnemo držati veliki buffer.
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireModulePermission(request, "invoicing");
  if (!auth.authorized) return auth.response;

  const url = await getInvoicePdfUrl(params.id);
  if (!url) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ url });
}
