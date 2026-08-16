import { NextResponse } from "next/server";
import {
  linkGuestClientsToUser,
  linkOwnerAccount,
  resolveOwnerByUserId,
} from "@rent-a-car/api/server";
import { getUserFromBearerToken } from "@/lib/supabase/bearer";

export const runtime = "nodejs";

/**
 * Mobile analog Next.js /api/auth/callback rute - poziva se odmah nakon
 * što mobile app postavi Supabase sesiju iz magic-link deep linka.
 * Ista logika kao web callback (linkanje + role resolve), samo preko
 * Bearer tokena umjesto cookieja, i vraća JSON umjesto redirecta.
 */
export async function POST(request: Request) {
  const user = await getUserFromBearerToken(request);
  if (!user?.email) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id: userId, email } = user;

  await linkOwnerAccount(userId, email);
  await linkGuestClientsToUser(userId, email);

  const owner = await resolveOwnerByUserId(userId);
  const role = owner ? "owner" : "client";

  return NextResponse.json({ role, email });
}
