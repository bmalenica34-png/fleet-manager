import { prisma } from "../db/client";
import {
  sendIncompleteClientDataEmail,
  sendIncompleteVehicleDataEmail,
  sendRegistrationExpiryEmail,
} from "../lib/email";

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

export interface IncompleteDataCheckResult {
  checked: number;
  notificationsSent: { vehicleId: string }[];
  errors: { vehicleId: string; error: string }[];
}

/**
 * Isti dedupe obrazac kao runRegistrationExpiryCheck (jedan sent-at
 * timestamp, notifikacija ide najviše jednom po vozilu - čak i ako se
 * incompleteReasons kasnije promijene). Samo owner (klijent ne treba znati
 * da je data-entry nepotpun) - za razliku od registracijskih podsjetnika
 * koji idu i aktivnom najmoprimcu.
 */
export async function runIncompleteVehicleDataCheck(): Promise<IncompleteDataCheckResult> {
  const notificationsSent: IncompleteDataCheckResult["notificationsSent"] = [];
  const errors: IncompleteDataCheckResult["errors"] = [];

  const vehicles = await prisma.vehicle.findMany({
    where: { hasIncompleteData: true, incompleteDataNotifiedAt: null },
  });

  for (const vehicle of vehicles) {
    try {
      await sendIncompleteVehicleDataEmail({
        to: getOwnerEmail(),
        recipientName: "Owner",
        vehicleLabel: `${vehicle.make} ${vehicle.model} (${vehicle.licensePlate})`,
        reasons: vehicle.incompleteReasons,
      });
      await prisma.vehicle.update({
        where: { id: vehicle.id },
        data: { incompleteDataNotifiedAt: new Date() },
      });
      notificationsSent.push({ vehicleId: vehicle.id });
    } catch (err) {
      errors.push({ vehicleId: vehicle.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { checked: vehicles.length, notificationsSent, errors };
}

export interface IncompleteClientDataCheckResult {
  checked: number;
  notificationsSent: { clientId: string }[];
  errors: { clientId: string; error: string }[];
}

/**
 * Isti dedupe obrazac kao runIncompleteVehicleDataCheck (jedan sent-at
 * timestamp, notifikacija ide najviše jednom po klijentu - čak i ako se
 * incompleteReasons kasnije promijene). Samo owner, isto obrazloženje kao
 * vozila.
 */
export async function runIncompleteClientDataCheck(): Promise<IncompleteClientDataCheckResult> {
  const notificationsSent: IncompleteClientDataCheckResult["notificationsSent"] = [];
  const errors: IncompleteClientDataCheckResult["errors"] = [];

  const clients = await prisma.client.findMany({
    where: { hasIncompleteData: true, incompleteDataNotifiedAt: null },
  });

  for (const client of clients) {
    try {
      await sendIncompleteClientDataEmail({
        to: getOwnerEmail(),
        recipientName: "Owner",
        clientLabel: `${client.firstName} ${client.lastName} (OIB ${client.oib})`,
        reasons: client.incompleteReasons,
      });
      await prisma.client.update({
        where: { id: client.id },
        data: { incompleteDataNotifiedAt: new Date() },
      });
      notificationsSent.push({ clientId: client.id });
    } catch (err) {
      errors.push({ clientId: client.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { checked: clients.length, notificationsSent, errors };
}
