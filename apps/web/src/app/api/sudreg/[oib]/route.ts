import { NextResponse } from "next/server";
import { lookupCompanyByOib } from "@rent-a-car/api/server";
import { requireOwnerSession } from "@/lib/requireOwnerSession";

export const runtime = "nodejs";

// GET /api/sudreg/:oib - dohvati naziv i adresu sjedišta tvrtke iz Sudskog
// registra za auto-popunu forme "novi klijent" (pravna osoba). Nikad ne
// baca - vraća { status } koji frontend koristi za poruku; ručni unos ostaje
// moguć u svakom slučaju.
export async function GET(
  request: Request,
  { params }: { params: { oib: string } }
) {
  const auth = await requireOwnerSession(request);
  if (!auth.authorized) return auth.response;

  const result = await lookupCompanyByOib(params.oib);
  return NextResponse.json(result);
}
