import type { Client, Owner } from "@prisma/client";
import { prisma } from "../db/client";

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
