import type { TermsAndConditions } from "@prisma/client";
import { prisma } from "../db/client";
import type { TermsCreateInput } from "../schemas/terms";

export interface TermsAndConditionsDTO {
  id: string;
  version: number;
  content: string;
  active: boolean;
  createdAt: Date;
}

function toDTO(terms: TermsAndConditions): TermsAndConditionsDTO {
  return {
    id: terms.id,
    version: terms.version,
    content: terms.content,
    active: terms.active,
    createdAt: terms.createdAt,
  };
}

export async function getActiveTerms(): Promise<TermsAndConditionsDTO | null> {
  const terms = await prisma.termsAndConditions.findFirst({ where: { active: true } });
  return terms ? toDTO(terms) : null;
}

export async function listTermsVersions(): Promise<TermsAndConditionsDTO[]> {
  const terms = await prisma.termsAndConditions.findMany({ orderBy: { version: "desc" } });
  return terms.map(toDTO);
}

/**
 * Kreira NOVU verziju i postavlja je kao aktivnu - nikad ne overwrita/briše
 * postojeće retke (potrebni za pravnu dokaznost starih ugovora, vidi
 * schema.prisma komentar). "Točno jedna aktivna verzija" je invarijanta koju
 * održava ISKLJUČIVO ova funkcija (transakcija) - nema drugog mjesta u
 * kodu koje piše u ovu tablicu.
 */
export async function createTermsVersion(input: TermsCreateInput): Promise<TermsAndConditionsDTO> {
  const terms = await prisma.$transaction(async (tx) => {
    await tx.termsAndConditions.updateMany({ where: { active: true }, data: { active: false } });
    return tx.termsAndConditions.create({ data: { content: input.content, active: true } });
  });
  return toDTO(terms);
}
