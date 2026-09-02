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
  // Fiskalizacija - cert base64/password se NE vraćaju frontendu (tajna);
  // `hasFinaCert` je dovoljno za prikaz stanja.
  vatRegistered: boolean;
  hasFinaCert: boolean;
  finaOib: string | null;
  finaPremiseLabel: string | null;
  finaDeviceLabel: string | null;
  finaPremiseStreet: string | null;
  finaPremiseHouseNumber: string | null;
  finaPremiseCity: string | null;
  finaPremisePostalCode: string | null;
  finaPremiseWorkHours: string | null;
  finaPremiseRegisteredAt: Date | null;
  updatedAt: Date;
}

type SettingsRow = {
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
  vatRegistered: boolean;
  finaCertBase64: string | null;
  finaOib: string | null;
  finaPremiseLabel: string | null;
  finaDeviceLabel: string | null;
  finaPremiseStreet: string | null;
  finaPremiseHouseNumber: string | null;
  finaPremiseCity: string | null;
  finaPremisePostalCode: string | null;
  finaPremiseWorkHours: string | null;
  finaPremiseRegisteredAt: Date | null;
  updatedAt: Date;
};

async function toDTO(settings: SettingsRow): Promise<CompanySettingsDTO> {
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
    vatRegistered: settings.vatRegistered,
    hasFinaCert: settings.finaCertBase64 != null,
    finaOib: settings.finaOib,
    finaPremiseLabel: settings.finaPremiseLabel,
    finaDeviceLabel: settings.finaDeviceLabel,
    finaPremiseStreet: settings.finaPremiseStreet,
    finaPremiseHouseNumber: settings.finaPremiseHouseNumber,
    finaPremiseCity: settings.finaPremiseCity,
    finaPremisePostalCode: settings.finaPremisePostalCode,
    finaPremiseWorkHours: settings.finaPremiseWorkHours,
    finaPremiseRegisteredAt: settings.finaPremiseRegisteredAt,
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
  // Ako se promijeni OIB / oznaka prostora / adresa prostora, prethodna CIS
  // registracija poslovnog prostora više ne vrijedi - očisti marker da UI
  // ponovno traži "Registriraj poslovni prostor".
  const premiseTouched =
    input.finaOib !== undefined ||
    input.finaPremiseLabel !== undefined ||
    input.finaPremiseStreet !== undefined ||
    input.finaPremiseHouseNumber !== undefined ||
    input.finaPremiseCity !== undefined ||
    input.finaPremisePostalCode !== undefined;

  const data = premiseTouched ? { ...input, finaPremiseRegisteredAt: null } : input;

  const settings = await prisma.companySettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, ...data },
    update: data,
  });
  return toDTO(settings);
}

/** Sprema FINA cert (.p12/.pfx) kao base64 + zaporku. Cert se nikad ne vraća. */
export async function setFinaCert(certBase64: string, password: string): Promise<CompanySettingsDTO> {
  const settings = await prisma.companySettings.upsert({
    where: { id: SETTINGS_ID },
    create: {
      id: SETTINGS_ID,
      finaCertBase64: certBase64,
      finaCertPassword: password,
      finaPremiseRegisteredAt: null,
    },
    update: {
      finaCertBase64: certBase64,
      finaCertPassword: password,
      finaPremiseRegisteredAt: null,
    },
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
