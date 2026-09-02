import { NextResponse } from "next/server";
import { listInvoices } from "@rent-a-car/api/server";
import { requireModulePermission } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireModulePermission(request, "invoicing");
  if (!auth.authorized) return auth.response;

  return NextResponse.json(await listInvoices());
}
