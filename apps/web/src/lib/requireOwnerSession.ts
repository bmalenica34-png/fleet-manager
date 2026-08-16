import { NextResponse } from "next/server";
import { resolveOwnerByUserId } from "@rent-a-car/api/server";
import type { Owner } from "@rent-a-car/api";
import { createClient } from "@/lib/supabase/server";
import { getUserFromBearerToken } from "@/lib/supabase/bearer";

export type OwnerSessionResult =
  | { authorized: true; owner: Owner }
  | { authorized: false; response: NextResponse };

/**
 * Owner API rute (vehicles/clients/contracts CRUD) nisu zaštićene samo
 * time što dashboard stranice preusmjeravaju neulogirane korisnike -
 * bez ove provjere netko tko pogodi URL može direktno pozvati API.
 *
 * Prvo se provjerava Authorization: Bearer header (mobile - nema cookie
 * jara), fallback na cookie-based sesiju (web). Web pozivi i dalje rade
 * identično kao prije jer nikad ne šalju taj header.
 */
export async function requireOwnerSession(request: Request): Promise<OwnerSessionResult> {
  const bearerUser = await getUserFromBearerToken(request);

  const user =
    bearerUser ??
    (await (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      return user;
    })());

  if (!user) {
    return {
      authorized: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }

  const owner = await resolveOwnerByUserId(user.id);
  if (!owner) {
    return {
      authorized: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }

  return { authorized: true, owner };
}
