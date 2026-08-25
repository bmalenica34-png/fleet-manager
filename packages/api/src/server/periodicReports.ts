import { prisma } from "../db/client";
import type { ReportFrequency } from "../schemas/companySettings";
import { getCompanySettings, getCompanyInfoForPdf } from "./companySettings";
import { getFleetStats, type VehicleStatsDTO } from "./vehicleStats";
import { sendPeriodicReportEmail } from "../lib/email";
import { renderReportPdf } from "../pdf/generate";

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

// Interval se tretira kao "dana od zadnjeg slanja" (ne kalendarski dan/
// tjedan/mjesec) - jednostavnije, i dosljedno s "custom N dana" opcijom
// (vidi schema.prisma komentar na CompanySettings.reportFrequency).
const FIXED_INTERVAL_DAYS: Record<Exclude<ReportFrequency, "off" | "custom">, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

function getOwnerEmail(): string {
  const email = process.env.OWNER_EMAIL;
  if (!email) {
    throw new Error("Missing required env var: OWNER_EMAIL");
  }
  return email;
}

function getOwnerAppUrl(): string {
  const url = process.env.NEXT_PUBLIC_OWNER_APP_URL;
  if (!url) {
    throw new Error("Missing required env var: NEXT_PUBLIC_OWNER_APP_URL");
  }
  return url;
}

export interface FleetReportData {
  from: Date;
  to: Date;
  vehicles: (VehicleStatsDTO & { vehicleLabel: string })[];
  totals: {
    revenue: number;
    serviceCost: number;
    additionalCosts: number;
    profit: number;
    rentedDays: number;
    totalDays: number;
  };
}

/**
 * Isti brojevi kao dashboard (getFleetStats, vidi vehicleStats.ts) - samo
 * spojeni s vehicle labelama (marka/model/tablice) za prikaz, plus zbrojevi
 * preko cijele flote. Koristi ga i automatski periodični izvještaj i
 * on-demand PDF export (isti podaci, dva izlaza).
 */
export async function buildFleetReportData(from: Date, to: Date): Promise<FleetReportData> {
  const [stats, vehicles] = await Promise.all([
    getFleetStats(from, to),
    prisma.vehicle.findMany({ select: { id: true, make: true, model: true, licensePlate: true } }),
  ]);

  const labelById = new Map(vehicles.map((v) => [v.id, `${v.make} ${v.model} (${v.licensePlate})`]));
  const withLabels = stats.map((s) => ({ ...s, vehicleLabel: labelById.get(s.vehicleId) ?? s.vehicleId }));

  const totals = withLabels.reduce(
    (acc, s) => ({
      revenue: acc.revenue + s.revenue,
      serviceCost: acc.serviceCost + s.serviceCost,
      additionalCosts: acc.additionalCosts + s.additionalCosts,
      profit: acc.profit + s.profit,
      rentedDays: acc.rentedDays + s.rentedDays,
      totalDays: acc.totalDays + s.totalDays,
    }),
    { revenue: 0, serviceCost: 0, additionalCosts: 0, profit: 0, rentedDays: 0, totalDays: 0 }
  );

  return { from, to, vehicles: withLabels, totals };
}

/**
 * On-demand PDF export za proizvoljno odabrano razdoblje (dashboard gumb
 * "Preuzmi PDF izvještaj", odvojeno od automatskog periodičnog maila) -
 * generira se u letu, NIJE spremljen na Hetzner (ephemeralno,
 * parametrizirano po pozivu). Isti podaci kao periodični mail
 * (buildFleetReportData), samo PDF izlaz.
 */
export async function generateReportPdfBuffer(from: Date, to: Date): Promise<Buffer> {
  const [data, company] = await Promise.all([buildFleetReportData(from, to), getCompanyInfoForPdf()]);
  return renderReportPdf({
    companyName: company.name || "Rent-a-Car Manager",
    from,
    to,
    vehicles: data.vehicles,
    totals: data.totals,
  });
}

/**
 * Broj dana od zadnjeg poslanog izvještaja do koje je "dan za sljedeći"
 * (interval), ili null ako izvještaji nisu uključeni (`reportFrequency ===
 * "off"`) ili je "custom" bez postavljenog broja dana (nepotpuna
 * konfiguracija - tretira se kao "nema izvještaja" dok se ne dopuni).
 */
export function getReportIntervalDays(settings: {
  reportFrequency: ReportFrequency;
  reportCustomIntervalDays: number | null;
}): number | null {
  if (settings.reportFrequency === "off") return null;
  if (settings.reportFrequency === "custom") return settings.reportCustomIntervalDays;
  return FIXED_INTERVAL_DAYS[settings.reportFrequency];
}

export function isReportDue(
  settings: { reportFrequency: ReportFrequency; reportCustomIntervalDays: number | null },
  lastReportSentAt: Date | null,
  now: Date
): boolean {
  const intervalDays = getReportIntervalDays(settings);
  if (intervalDays == null) return false;
  if (!lastReportSentAt) return true;

  const daysSinceLast = Math.floor((startOfDay(now).getTime() - startOfDay(lastReportSentAt).getTime()) / 86400000);
  return daysSinceLast >= intervalDays;
}

export interface PeriodicReportCheckResult {
  sent: boolean;
  reason?: "off" | "not_due" | "incomplete_custom_interval" | "email_disabled";
  period?: { from: Date; to: Date };
}

/**
 * Cron entry point - poziva se iz istog dnevnog crona kao registracijski/
 * nepotpuni-podaci checkovi (vidi PROGRESS.md, namjerno bez novog Vercel
 * cron entryja). App je single-tenant (JEDAN CompanySettings red, vidi
 * schema.prisma) - "svaki owner account ima svoj interval" iz zahtjeva
 * kolabira na "taj jedan red ima svoj interval", nema iteracije po
 * ownerima.
 */
export async function runPeriodicReportCheck(): Promise<PeriodicReportCheckResult> {
  const settings = await getCompanySettings();

  if (settings.reportFrequency === "off") {
    return { sent: false, reason: "off" };
  }

  const intervalDays = getReportIntervalDays(settings);
  if (intervalDays == null) {
    return { sent: false, reason: "incomplete_custom_interval" };
  }

  // Nema drugog automatiziranog artefakta osim maila (in-app dostupnost je
  // već pokrivena postojećim /vehicles/stats dashboardom u bilo kojem
  // trenutku) - ako je mail isključen, nema što cron ovdje treba raditi.
  // NE dira lastReportSentAt - kad vlasnik kasnije ponovno uključi mail,
  // izvještaj za "dužno" razdoblje odmah krene sljedećim cron pokretanjem.
  if (!settings.reportEmailEnabled) {
    return { sent: false, reason: "email_disabled" };
  }

  const now = new Date();
  if (!isReportDue(settings, settings.lastReportSentAt, now)) {
    return { sent: false, reason: "not_due" };
  }

  const to = endOfDay(now);
  const from = startOfDay(new Date(now.getTime() - (intervalDays - 1) * 86400000));

  const data = await buildFleetReportData(from, to);
  await sendPeriodicReportEmail({
    to: getOwnerEmail(),
    data,
    dashboardUrl: `${getOwnerAppUrl()}/`,
  });

  await prisma.companySettings.update({
    where: { id: "singleton" },
    data: { lastReportSentAt: now },
  });

  return { sent: true, period: { from, to } };
}
