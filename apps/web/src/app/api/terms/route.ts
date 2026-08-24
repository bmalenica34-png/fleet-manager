import { NextResponse } from "next/server";
import { termsCreateSchema } from "@rent-a-car/api";
import { createTermsVersion, listTermsVersions } from "@rent-a-car/api/server";
import { zodErrorResponse } from "@/lib/handleZodError";
import { requireModulePermission } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

// Isti "settings" modul kao ostatak tvrtkinih postavki - uređivanje uvjeta
// najma je jednako osjetljivo kao naziv/OIB/logo tvrtke.

export async function GET(request: Request) {
  const auth = await requireModulePermission(request, "settings");
  if (!auth.authorized) return auth.response;

  return NextResponse.json(await listTermsVersions());
}

export async function POST(request: Request) {
  const auth = await requireModulePermission(request, "settings");
  if (!auth.authorized) return auth.response;

  const body = await request.json();
  const parsed = termsCreateSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const terms = await createTermsVersion(parsed.data);
  return NextResponse.json(terms, { status: 201 });
}
