import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  linkGuestClientsToUser,
  linkOwnerAccount,
  resolveOwnerByUserId,
} from "@rent-a-car/api/server";

export const runtime = "nodejs";

/**
 * Jedan callback za owner i client magic link - uloga se ne prenosi kroz
 * redirect URL, nego se odredi nakon logina provjerom Owner/Client
 * tablica. Oba linking poziva su no-op ako se ne primjenjuju, pa je
 * sigurno pozvati oba bez obzira koja je login stranica inicirala flow.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=invalid_link", url.origin));
  }

  const supabase = createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user?.email) {
    return NextResponse.redirect(new URL("/login?error=invalid_link", url.origin));
  }

  const { id: userId, email } = data.user;

  await linkOwnerAccount(userId, email);
  await linkGuestClientsToUser(userId, email);

  const owner = await resolveOwnerByUserId(userId);
  const destination = owner ? "/vehicles" : "/portal";

  return NextResponse.redirect(new URL(destination, url.origin));
}
