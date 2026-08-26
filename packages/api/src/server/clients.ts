import type { Client } from "@prisma/client";
import { prisma } from "../db/client";
import type { ClientCreateInput, ClientDocumentSlot, ClientUpdateInput } from "../schemas/client";
import { deleteObject, getPresignedDownloadUrl } from "../storage/hetzner";
import { parseHrDateToIso } from "../lib/dateFormat";

export async function listClients(): Promise<Client[]> {
  return prisma.client.findMany({ orderBy: { createdAt: "desc" } });
}

export async function getClient(id: string): Promise<Client | null> {
  return prisma.client.findUnique({ where: { id } });
}

export async function createClient(input: ClientCreateInput): Promise<Client> {
  return prisma.client.create({ data: input });
}

export async function updateClient(
  id: string,
  input: ClientUpdateInput
): Promise<Client> {
  return prisma.client.update({ where: { id }, data: input });
}

// ---------------------------------------------------------------------------
// Dokumenti (osobna + vozačka, prednja/stražnja) - vidi schema.prisma
// komentar na Client za zašto driverLicenseKey/idDocumentKey (signing
// wizard) ostaju odvojeni od *FrontKey/*BackKey (upravljano sa stranice
// klijenta).
// ---------------------------------------------------------------------------

const SLOT_FIELD: Record<ClientDocumentSlot, keyof Client> = {
  idDocumentFront: "idDocumentFrontKey",
  idDocumentBack: "idDocumentBackKey",
  driverLicenseFront: "driverLicenseFrontKey",
  driverLicenseBack: "driverLicenseBackKey",
};

export interface ClientDTO {
  id: string;
  firstName: string;
  lastName: string;
  oib: string;
  email: string;
  phone: string;
  address: string | null;
  idNumber: string | null;
  driverLicenseNumber: string | null;
  birthDate: Date | null;
  hasIncompleteData: boolean;
  incompleteReasons: string[];
  idDocumentFrontUrl: string | null;
  idDocumentBackUrl: string | null;
  driverLicenseFrontUrl: string | null;
  driverLicenseBackUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

async function toClientDTO(client: Client): Promise<ClientDTO> {
  // "Prednja strana" broji se kao prisutna i ako klijent ima samo stariji
  // signing-wizard scan (driverLicenseKey/idDocumentKey) - vidi schema.prisma
  // komentar. Nema takvog fallbacka za stražnju stranu (ta nikad nije
  // postojala prije ove promjene).
  const idFrontKey = client.idDocumentFrontKey ?? client.idDocumentKey;
  const licenseFrontKey = client.driverLicenseFrontKey ?? client.driverLicenseKey;

  const [idDocumentFrontUrl, idDocumentBackUrl, driverLicenseFrontUrl, driverLicenseBackUrl] =
    await Promise.all([
      idFrontKey ? getPresignedDownloadUrl(idFrontKey) : Promise.resolve(null),
      client.idDocumentBackKey ? getPresignedDownloadUrl(client.idDocumentBackKey) : Promise.resolve(null),
      licenseFrontKey ? getPresignedDownloadUrl(licenseFrontKey) : Promise.resolve(null),
      client.driverLicenseBackKey
        ? getPresignedDownloadUrl(client.driverLicenseBackKey)
        : Promise.resolve(null),
    ]);

  return {
    id: client.id,
    firstName: client.firstName,
    lastName: client.lastName,
    oib: client.oib,
    email: client.email,
    phone: client.phone,
    address: client.address,
    idNumber: client.idNumber,
    driverLicenseNumber: client.driverLicenseNumber,
    birthDate: client.birthDate,
    hasIncompleteData: client.hasIncompleteData,
    incompleteReasons: client.incompleteReasons,
    idDocumentFrontUrl,
    idDocumentBackUrl,
    driverLicenseFrontUrl,
    driverLicenseBackUrl,
    createdAt: client.createdAt,
    updatedAt: client.updatedAt,
  };
}

export async function getClientWithDocuments(id: string): Promise<ClientDTO | null> {
  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) return null;
  return toClientDTO(client);
}

export async function setClientDocument(
  clientId: string,
  slot: ClientDocumentSlot,
  key: string
): Promise<ClientDTO> {
  const field = SLOT_FIELD[slot];
  const existing = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  const oldKey = existing[field] as string | null;
  if (oldKey) {
    await deleteObject(oldKey);
  }
  const client = await prisma.client.update({
    where: { id: clientId },
    data: { [field]: key },
  });
  return toClientDTO(client);
}

// ---------------------------------------------------------------------------
// CSV bulk import - isti obrazac kao importVehiclesFromCsvRows (server/
// vehicles.ts). Ukratko: red se UVIJEK kreira (i s nedostajućim/lošim
// poljima, koja se bilježe u incompleteReasons) OSIM kad je OIB prazan
// (shema zahtijeva NOT NULL+UNIQUE, nema smislenog placeholdera - isti
// razlog kao registarska tablica kod vozila) ili kad OIB/broj osobne već
// postoje na drugom klijentu (pravi duplikat, ne "nepotpun podatak") - ta
// dva slučaja se preskaču i prijavljuju kao greška retka. CSV uvoz NE
// uključuje dokumente (osobna/vozačka slike) - to ostaje ručni naknadni
// korak po klijentu (postojeći missingSlots prikaz na /clients/[id] već
// flagira tu odvojenu "nedostaju dokumenti" kompletnost, nema potrebe za
// dupliciranjem te logike ovdje).
// ---------------------------------------------------------------------------

const PLACEHOLDER = "Nepoznato";
const PLACEHOLDER_EMAIL = "nepoznato@nepoznato.hr";

export interface ClientCsvImportedRow {
  rowNumber: number;
  clientId: string;
  firstName: string;
  lastName: string;
  oib: string;
  incomplete: boolean;
  reasons: string[];
}

export interface ClientCsvSkippedRow {
  rowNumber: number;
  reason: string;
}

export interface ClientCsvImportResult {
  importedCount: number;
  incompleteCount: number;
  skippedCount: number;
  imported: ClientCsvImportedRow[];
  skipped: ClientCsvSkippedRow[];
}

function csvField(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value) return value.trim();
  }
  return "";
}

/**
 * `rows` dolazi iz parseCsv() - ključevi su lowercase zaglavlja iz CSV-a.
 * Prihvaća i hrvatske nazive iz predloška ("ime", "broj osobne"...) i
 * engleske field-name ekvivalente (za robusnost ako netko preimenuje
 * zaglavlja u nekom alatu).
 */
export async function importClientsFromCsvRows(
  rows: Record<string, string>[]
): Promise<ClientCsvImportResult> {
  const seenOibs = new Set<string>();
  const seenIdNumbers = new Set<string>();

  const imported: ClientCsvImportedRow[] = [];
  const skipped: ClientCsvSkippedRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 2; // 1-indeksirano + preskoči header red
    const row = rows[i];

    const oib = csvField(row, "oib");
    if (!oib) {
      skipped.push({
        rowNumber,
        reason: "Nedostaje OIB (obavezno polje - klijent se ne može uvesti bez njega)",
      });
      continue;
    }

    const oibKey = oib.toLowerCase();
    if (seenOibs.has(oibKey)) {
      skipped.push({ rowNumber, reason: `Duplikat OIB-a unutar CSV datoteke (${oib})` });
      continue;
    }
    const existingByOib = await prisma.client.findFirst({
      where: { oib: { equals: oib, mode: "insensitive" } },
    });
    if (existingByOib) {
      skipped.push({ rowNumber, reason: `OIB ${oib} već postoji u bazi` });
      continue;
    }

    const idNumberRaw = csvField(row, "broj osobne", "idnumber", "id number");
    const idNumber = idNumberRaw || null;
    if (idNumber) {
      const idNumberKey = idNumber.toLowerCase();
      if (seenIdNumbers.has(idNumberKey)) {
        skipped.push({ rowNumber, reason: `Duplikat broja osobne unutar CSV datoteke (${idNumber})` });
        continue;
      }
      const existingByIdNumber = await prisma.client.findFirst({
        where: { idNumber: { equals: idNumber, mode: "insensitive" } },
      });
      if (existingByIdNumber) {
        skipped.push({
          rowNumber,
          reason: `Broj osobne ${idNumber} već postoji u bazi (klijent ${existingByIdNumber.firstName} ${existingByIdNumber.lastName})`,
        });
        continue;
      }
    }

    const reasons: string[] = [];

    const firstNameRaw = csvField(row, "ime", "firstname", "first name");
    if (!firstNameRaw) reasons.push("Nedostaje ime");
    const firstName = firstNameRaw || PLACEHOLDER;

    const lastNameRaw = csvField(row, "prezime", "lastname", "last name");
    if (!lastNameRaw) reasons.push("Nedostaje prezime");
    const lastName = lastNameRaw || PLACEHOLDER;

    const emailRaw = csvField(row, "email");
    if (!emailRaw) reasons.push("Nedostaje email");
    const email = (emailRaw || PLACEHOLDER_EMAIL).toLowerCase();

    const phoneRaw = csvField(row, "telefon", "phone");
    if (!phoneRaw) reasons.push("Nedostaje telefon");
    const phone = phoneRaw || PLACEHOLDER;

    const address = csvField(row, "adresa", "address") || null;
    if (!address) reasons.push("Nedostaje adresa");

    const driverLicenseNumber = csvField(row, "broj vozačke", "driverlicensenumber", "driver license number") || null;
    if (!driverLicenseNumber) reasons.push("Nedostaje broj vozačke");

    const birthDateRaw = csvField(row, "datum rođenja", "birthdate", "date of birth");
    let birthDate: Date | undefined;
    if (!birthDateRaw) {
      reasons.push("Nedostaje datum rođenja");
    } else {
      const iso = parseHrDateToIso(birthDateRaw);
      if (iso) {
        birthDate = new Date(iso);
      } else {
        reasons.push(`Neispravan format datuma rođenja ("${birthDateRaw}", očekivan DD.MM.GGGG.)`);
      }
    }

    const client = await prisma.client.create({
      data: {
        firstName,
        lastName,
        oib,
        email,
        phone,
        address,
        idNumber,
        driverLicenseNumber,
        birthDate,
        hasIncompleteData: reasons.length > 0,
        incompleteReasons: reasons,
      },
    });

    seenOibs.add(oibKey);
    if (idNumber) seenIdNumbers.add(idNumber.toLowerCase());

    imported.push({
      rowNumber,
      clientId: client.id,
      firstName: client.firstName,
      lastName: client.lastName,
      oib: client.oib,
      incomplete: reasons.length > 0,
      reasons,
    });
  }

  return {
    importedCount: imported.length,
    incompleteCount: imported.filter((c) => c.incomplete).length,
    skippedCount: skipped.length,
    imported,
    skipped,
  };
}
