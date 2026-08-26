import { NextResponse } from "next/server";
import { markRentPaymentPaid } from "@rent-a-car/api/server";
import { requireModulePermission } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireModulePermission(request, "invoicing");
  if (!auth.authorized) return auth.response;

  const rentPayment = await markRentPaymentPaid(params.id);
  return NextResponse.json(rentPayment);
}
