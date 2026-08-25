import { prisma } from "../db/client";
import type { CompanySettingsUpdateInput, ReportFrequency } from "../schemas/companySettings";
import { deleteObject, getPresignedDownloadUrl } from "../storage/hetzner";

// Singleton red - jedina instanca CompanySettings, id je fiksan (vidi
// komentar u schema.prisma). upsert svugdje niže znači "kreiraj prazan red
// ako još ne postoji" - owner ne mora ništa posebno "inicijalizirati" prije
// prvog posjeta /settings stranici.
const SETTINGS_ID = "singleton";

export interface CompanySettingsDTO {
  name: string | null;
  oib: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logoUrl: string | null;
  reportFrequency: ReportFrequency;
  reportCustomIntervalDays: number | null;
  reportEmailEnabled: boolean;
  lastReportSentAt: Date | null;
  updatedAt: Date;
}

async function toDTO(settings: {
  name: string | null;
  oib: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logoKey: string | null;
  reportFrequency: ReportFrequency;
  reportCustomIntervalDays: number | null;
  reportEmailEnabled: boolean;
  lastReportSentAt: Date | null;
  updatedAt: Date;
}): Promise<CompanySettingsDTO> {
  return {
    name: settings.name,
    oib: settings.oib,
    address: settings.address,
    phone: settings.phone,
    email: settings.email,
    logoUrl: settings.logoKey ? await getPresignedDownloadUrl(settings.logoKey) : null,
    reportFrequency: settings.reportFrequency,
    reportCustomIntervalDays: settings.reportCustomIntervalDays,
    reportEmailEnabled: settings.reportEmailEnabled,
    lastReportSentAt: settings.lastReportSentAt,
    updatedAt: settings.updatedAt,
  };
}

export async function getCompanySettings(): Promise<CompanySettingsDTO> {
  const settings = await prisma.companySettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID },
    update: {},
  });
  return toDTO(settings);
}

export async function updateCompanySettings(
  input: CompanySettingsUpdateInput
): Promise<CompanySettingsDTO> {
  const settings = await prisma.companySettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...input },
    update: input,
  });
  return toDTO(settings);
}

export async function setCompanyLogo(key: string): Promise<CompanySettingsDTO> {
  const existing = await prisma.companySettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID },
    update: {},
  });
  if (existing.logoKey) {
    await deleteObject(existing.logoKey);
  }
  const settings = await prisma.companySettings.update({
    where: { id: SETTINGS_ID },
    data: { logoKey: key },
  });
  return toDTO(settings);
}

/**
 * Podaci za zaglavlje/potpisni blok Contract PDF-a. Odvojeno od
 * CompanySettingsDTO (iako sadržajno preklapa) jer PDF template očekuje
 * "" umjesto null za nepopunjena polja (postojeća `dash()` konvencija u
 * ContractPdf.tsx), dok API DTO prema frontendu vraća pravi null.
 */
export async function getCompanyInfoForPdf(): Promise<{
  name: string;
  address: string;
  oib: string;
  phone: string;
  email: string;
  logoUrl: string | null;
}> {
  const settings = await getCompanySettings();
  return {
    name: settings.name ?? "",
    address: settings.address ?? "",
    oib: settings.oib ?? "",
    phone: settings.phone ?? "",
    email: settings.email ?? "",
    logoUrl: settings.logoUrl,
  };
}
