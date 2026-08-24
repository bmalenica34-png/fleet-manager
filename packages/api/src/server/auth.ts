import type { Client, Owner } from "@prisma/client";
import { prisma } from "../db/client";
import type { PermissionModule } from "../schemas/employee";

export async function resolveOwnerByUserId(userId: string): Promise<Owner | null> {
  return prisma.owner.findUnique({ where: { userId } });
}

export async function resolveClientByUserId(userId: string): Promise<Client | null> {
  return prisma.client.findUnique({ where: { userId } });
}

/**
 * Provjerava je li email na owner allowlisti - poziva se PRIJE slanja
 * magic linka, da nasumični email ne može uopće otvoriti Supabase auth
 * sesiju na owner strani.
 */
export async function isEmailAllowedAsOwner(email: string): Promise<boolean> {
  const owner = await prisma.owner.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  return owner !== null;
}

/**
 * Poziva se nakon uspješnog magic-link logina na owner strani. Ako email
 * odgovara postojećem Owner redu bez userId-a, poveže ga (jednokratno -
 * idempotentno ako se pozove ponovno).
 */
export async function linkOwnerAccount(userId: string, email: string): Promise<void> {
  const owner = await prisma.owner.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, userId: null },
  });
  if (owner) {
    await prisma.owner.update({ where: { id: owner.id }, data: { userId } });
  }
}

/**
 * Poziva se na SVAKOM uspješnom client loginu (ne samo pri prvoj
 * registraciji) - pronalazi sve "gost" Client redove (userId je null) s
 * podudarajućim emailom (case-insensitive) i poveže ih s trenutnim
 * Supabase korisnikom. Idempotentno - no-op ako nema ničeg za povezati.
 * Supabase-ova verifikacija magic linka je dovoljan dokaz vlasništva
 * emaila, dodatna potvrda nije potrebna.
 *
 * userId je @unique na Client, pa ako owner greškom kreirao više "gost"
 * redova s istim emailom (duplikat), povežemo userId samo na najstariji,
 * a ugovore ostalih premjestimo na taj isti red - inače bi ostali
 * nepovezani i nevidljivi klijentu.
 */
// ---------------------------------------------------------------------------
// Owner-app principal (owner ILI employee) - vidi PROGRESS.md "Employee
// accounts" nastavak. Owner i Employee su odvojeni Prisma modeli (Employee
// se pre-provisionira po emailu isto kao Owner, vidi schema.prisma komentar
// na Employee), ovaj sloj ih normalizira u jedan tip za API guardove/UI.
// ---------------------------------------------------------------------------

export type SessionPrincipal =
  | { kind: "owner"; id: string; name: string | null; email: string }
  | { kind: "employee"; id: string; name: string; email: string; permissions: PermissionModule[] };

export function principalHasPermission(
  principal: SessionPrincipal,
  module: PermissionModule
): boolean {
  return principal.kind === "owner" || principal.permissions.includes(module);
}

/**
 * Owner uvijek ima puni pristup (hardcoded, ne editable - vidi zahtjev).
 * Deaktiviran employee (status "deactivated") namjerno resolvea u null iako
 * njegov Supabase userId i dalje postoji - deaktivacija tako funkcionalno
 * "gasi login" bez brisanja Supabase accounta ili povijesnih podataka
 * (Contract.createdByEmployeeId ostaje netaknut).
 */
export async function resolveOwnerAppPrincipal(userId: string): Promise<SessionPrincipal | null> {
  const owner = await prisma.owner.findUnique({ where: { userId } });
  if (owner) {
    return { kind: "owner", id: owner.id, name: owner.name, email: owner.email };
  }

  const employee = await prisma.employee.findUnique({
    where: { userId },
    include: { permissions: true },
  });
  if (employee && employee.status === "active") {
    return {
      kind: "employee",
      id: employee.id,
      name: `${employee.firstName} ${employee.lastName}`,
      email: employee.email,
      permissions: employee.permissions.map((p) => p.module),
    };
  }

  return null;
}

/**
 * Isto kao isEmailAllowedAsOwner, prošireno na aktivne Employee redove -
 * poziva se PRIJE slanja magic linka na owner-app login stranici (koju sad
 * dijele owner i employee, vidi apps/web/.../auth/owner/request-link).
 */
export async function isEmailAllowedForOwnerApp(email: string): Promise<boolean> {
  const allowedAsOwner = await isEmailAllowedAsOwner(email);
  if (allowedAsOwner) return true;

  const employee = await prisma.employee.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, status: "active" },
  });
  return employee !== null;
}

/**
 * Isto kao linkOwnerAccount, prošireno da pokuša i Employee povezivanje -
 * oba poziva su no-op ako se ne primjenjuju, pa je sigurno pozvati oba bez
 * obzira je li ovo owner ili employee login (isti obrazac kao
 * linkOwnerAccount + linkGuestClientsToUser u api/auth/callback).
 */
export async function linkAccountAfterOwnerAppLogin(userId: string, email: string): Promise<void> {
  await linkOwnerAccount(userId, email);

  const employee = await prisma.employee.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, userId: null, status: "active" },
  });
  if (employee) {
    await prisma.employee.update({ where: { id: employee.id }, data: { userId } });
  }
}

export async function linkGuestClientsToUser(userId: string, email: string): Promise<number> {
  const guestClients = await prisma.client.findMany({
    where: { email: { equals: email, mode: "insensitive" }, userId: null },
    orderBy: { createdAt: "asc" },
  });
  if (guestClients.length === 0) return 0;

  const [primary, ...duplicates] = guestClients;
  await prisma.client.update({ where: { id: primary.id }, data: { userId } });

  if (duplicates.length > 0) {
    await prisma.contract.updateMany({
      where: { clientId: { in: duplicates.map((d: Client) => d.id) } },
      data: { clientId: primary.id },
    });
  }

  return guestClients.length;
}
