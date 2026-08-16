import { prisma } from "../db/client";
import { sendRegistrationExpiryEmail } from "../lib/email";

const MILESTONES = [
  { days: 7, field: "registrationReminder7SentAt" as const },
  { days: 3, field: "registrationReminder3SentAt" as const },
  { days: 0, field: "registrationReminder0SentAt" as const },
];

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

function getOwnerEmail(): string {
  const email = process.env.OWNER_EMAIL;
  if (!email) {
    throw new Error("Missing required env var: OWNER_EMAIL");
  }
  return email;
}

export interface RegistrationCheckResult {
  checked: number;
  remindersSent: { vehicleId: string; days: number }[];
  errors: { vehicleId: string; days: number; error: string }[];
}

/**
 * Za svako vozilo kojem registracija ističe točno za 7, 3 ili 0 dana (i
 * taj milestone još nije poslan - dedupe polja na Vehicle), šalje mail
 * vlasniku i klijentu koji trenutno iznajmljuje to vozilo (ako postoji
 * aktivan potpisan ugovor). Svaki milestone se šalje najviše jednom.
 */
export async function runRegistrationExpiryCheck(): Promise<RegistrationCheckResult> {
  const remindersSent: RegistrationCheckResult["remindersSent"] = [];
  const errors: RegistrationCheckResult["errors"] = [];
  let checked = 0;

  for (const milestone of MILESTONES) {
    const target = new Date();
    target.setDate(target.getDate() + milestone.days);

    const vehicles = await prisma.vehicle.findMany({
      where: {
        registrationExpiresAt: { gte: startOfDay(target), lte: endOfDay(target) },
        [milestone.field]: null,
      },
    });

    checked += vehicles.length;

    for (const vehicle of vehicles) {
      try {
        const now = new Date();
        const activeContract = await prisma.contract.findFirst({
          where: {
            vehicleId: vehicle.id,
            status: "signed",
            dateFrom: { lte: now },
            dateTo: { gte: now },
          },
          include: { client: true },
          orderBy: { dateFrom: "desc" },
        });

        const vehicleLabel = `${vehicle.make} ${vehicle.model} (${vehicle.licensePlate})`;

        await Promise.all([
          sendRegistrationExpiryEmail({
            to: getOwnerEmail(),
            recipientName: "Owner",
            vehicleLabel,
            expiresAt: vehicle.registrationExpiresAt!,
            daysUntil: milestone.days,
          }),
          activeContract
            ? sendRegistrationExpiryEmail({
                to: activeContract.client.email,
                recipientName: `${activeContract.client.firstName} ${activeContract.client.lastName}`,
                vehicleLabel,
                expiresAt: vehicle.registrationExpiresAt!,
                daysUntil: milestone.days,
              })
            : Promise.resolve(),
        ]);

        await prisma.vehicle.update({
          where: { id: vehicle.id },
          data: { [milestone.field]: new Date() },
        });

        remindersSent.push({ vehicleId: vehicle.id, days: milestone.days });
      } catch (err) {
        errors.push({
          vehicleId: vehicle.id,
          days: milestone.days,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return { checked, remindersSent, errors };
}
