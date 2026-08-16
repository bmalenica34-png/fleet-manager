import type { Client, Contract, Vehicle } from "@prisma/client";
import { prisma } from "../db/client";
import { createAnnexAndSendSigningEmail } from "./annexes";

const REMINDER_DAYS_BEFORE_EXPIRY = 3;

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Ugovori kojima dateTo pada točno REMINDER_DAYS_BEFORE_EXPIRY dana od danas,
 * status je "signed" (aktivan potpisan najam), i nemaju već poslan/nepotpisan
 * anex (izbjegava dupli podsjetnik ako cron pukne pa se ponovi isti dan).
 */
export async function findContractsExpiringSoon(): Promise<
  (Contract & { vehicle: Vehicle; client: Client })[]
> {
  const target = new Date();
  target.setDate(target.getDate() + REMINDER_DAYS_BEFORE_EXPIRY);

  return prisma.contract.findMany({
    where: {
      status: "signed",
      dateTo: { gte: startOfDay(target), lte: endOfDay(target) },
      annexes: { none: { status: { in: ["draft", "sent"] } } },
    },
    include: { vehicle: true, client: true },
  });
}

export interface ExpiringContractsCheckResult {
  checked: number;
  remindersSent: { contractId: string; annexId: string }[];
  errors: { contractId: string; error: string }[];
}

/**
 * Za svaki ugovor koji ističe za 3 dana, predlaže produženje za isto
 * razdoblje kao originalni najam, kreira Annex i šalje mail s linkom za
 * lakši signing flow (bez re-uploada dokumenata).
 */
export async function runExpiringContractsCheck(): Promise<ExpiringContractsCheckResult> {
  const contracts = await findContractsExpiringSoon();
  const remindersSent: { contractId: string; annexId: string }[] = [];
  const errors: { contractId: string; error: string }[] = [];

  for (const contract of contracts) {
    try {
      const rentalDurationMs = contract.dateTo.getTime() - contract.dateFrom.getTime();
      const proposedNewDateTo = new Date(contract.dateTo.getTime() + rentalDurationMs);
      const annex = await createAnnexAndSendSigningEmail(contract.id, proposedNewDateTo);
      remindersSent.push({ contractId: contract.id, annexId: annex.id });
    } catch (err) {
      errors.push({
        contractId: contract.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { checked: contracts.length, remindersSent, errors };
}
