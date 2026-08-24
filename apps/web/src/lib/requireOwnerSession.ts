import { NextResponse } from "next/server";
import {
  principalHasPermission,
  resolveOwnerAppPrincipal,
  type SessionPrincipal,
} from "@rent-a-car/api/server";
import type { PermissionModule } from "@rent-a-car/api";
import { createClient } from "@/lib/supabase/server";
import { getUserFromBearerToken } from "@/lib/supabase/bearer";

export type { SessionPrincipal };

export type OwnerSessionResult =
  | { authorized: true; principal: SessionPrincipal }
  | { authorized: false; response: NextResponse };

async function resolveRequestUserId(request: Request): Promise<string | null> {
  const bearerUser = await getUserFromBearerToken(request);
  if (bearerUser) return bearerUser.id;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * Owner-app API rute (vehicles/clients/contracts/settings CRUD) nisu
 * zaštićene samo time što dashboard stranice preusmjeravaju neulogirane
 * korisnike - bez ove provjere netko tko pogodi URL može direktno pozvati
 * API. Ovo je "je li uopće ulogiran (owner ili aktivan employee)" gate -
 * za per-modul permisije vidi requireModulePermission niže.
 *
 * Prvo se provjerava Authorization: Bearer header (mobile - nema cookie
 * jara), fallback na cookie-based sesiju (web). Web pozivi i dalje rade
 * identično kao prije jer nikad ne šalju taj header.
 */
export async function requireOwnerSession(request: Request): Promise<OwnerSessionResult> {
  const userId = await resolveRequestUserId(request);
  if (!userId) {
    return {
      authorized: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }

  const principal = await resolveOwnerAppPrincipal(userId);
  if (!principal) {
    return {
      authorized: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }

  return { authorized: true, principal };
}

/**
 * Isto kao requireOwnerSession, uz dodatnu provjeru da principal ima
 * permisiju za traženi modul (owner uvijek prolazi, employee samo ako ima
 * dodijeljen taj modul). Koristi se na svakoj ruti koja predstavlja
 * "unos/uređivanje" akciju za dani modul (POST/PATCH/DELETE) - GET/listing
 * rute ostaju pod plain requireOwnerSession jer više modula međusobno ovisi
 * o čitanju tuđih podataka (npr. kreiranje ugovora treba popis vozila i
 * klijenata), vidi PROGRESS.md.
 */
export async function requireModulePermission(
  request: Request,
  module: PermissionModule
): Promise<OwnerSessionResult> {
  const auth = await requireOwnerSession(request);
  if (!auth.authorized) return auth;

  if (!principalHasPermission(auth.principal, module)) {
    return {
      authorized: false,
      response: NextResponse.json({ error: "forbidden_module" }, { status: 403 }),
    };
  }

  return auth;
}

/**
 * Employee management (/api/employees*) je namjerno IZVAN permission sustava
 * - čak ni employee sa "settings" permisijom ne smije upravljati drugim
 * employeeima ili si dodijeliti dodatne permisije (privilege escalation).
 * Samo pravi Owner prolazi.
 */
export async function requireOwnerOnlySession(request: Request): Promise<OwnerSessionResult> {
  const auth = await requireOwnerSession(request);
  if (!auth.authorized) return auth;

  if (auth.principal.kind !== "owner") {
    return {
      authorized: false,
      response: NextResponse.json({ error: "owner_only" }, { status: 403 }),
    };
  }

  return auth;
}
