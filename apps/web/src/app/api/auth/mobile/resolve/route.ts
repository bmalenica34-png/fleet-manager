import { NextResponse } from "next/server";
import {
  linkAccountAfterOwnerAppLogin,
  linkGuestClientsToUser,
  resolveOwnerAppPrincipal,
} from "@rent-a-car/api/server";
import { getUserFromBearerToken } from "@/lib/supabase/bearer";

export const runtime = "nodejs";

/**
 * Mobile analog Next.js /api/auth/callback rute - poziva se odmah nakon
 * što mobile app postavi Supabase sesiju iz magic-link deep linka.
 * Ista logika kao web callback (linkanje + role resolve), samo preko
 * Bearer tokena umjesto cookieja, i vraća JSON umjesto redirecta. Employee
 * resolvea na "owner" role isto kao pravi Owner - owner-mobile je JEDNA
 * app za cijelu poslovnu stranu (owner i employee), permisije se
 * provjeravaju po pojedinom API pozivu, ne po roli ovdje.
 */
export async function POST(request: Request) {
  const user = await getUserFromBearerToken(request);
  if (!user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id: userId, email } = user;

  await linkAccountAfterOwnerAppLogin(userId, email);
  await linkGuestClientsToUser(userId, email);

  const principal = await resolveOwnerAppPrincipal(userId);
  const role = principal ? "owner" : "client";

  return NextResponse.json({ role, email });
}
