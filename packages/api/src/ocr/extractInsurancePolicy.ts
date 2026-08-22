import { extractPdfText } from "./pdfText";
import { parseHrDateToIso } from "../lib/dateFormat";
import { PLATE_PATTERN, VIN_PATTERN } from "./patterns";
import type { InsurancePolicyOcrResult } from "../schemas/ocr";

const DATE_PATTERN_GLOBAL = /\d{1,2}\.\d{1,2}\.\d{4}\.?/g;

// Police RAZLIČITIH osiguravajućih kuća imaju različit format (potvrđeno
// stvarnim primjerom - Adriatic osiguranje AO polica koristi "Istek
// godišnjeg osiguranja", ne bilo koju frazu iz stare fiksne liste). Umjesto
// liste TOČNIH fraza (koja bi trebala novi unos za svaku novu osiguravajuću
// kuću), tražimo RIJEČI koje se pojavljuju u istom retku kao datum, ili u
// SLJEDEĆEM retku (label i vrijednost su često na odvojenim recima kod
// strukturiranih polica - na Adriatic primjeru "Istek godišnjeg
// osiguranja:" je svoj redak, datum "07.07.2027." je tek SLJEDEĆI redak).
//
// Dva sloja prioriteta, ne jedan ravan skup: "istek"/"isteka" prvo, jer je
// to najspecifičniji signal za KRAJ razdoblja. Širi izrazi ("vrijedi do"/
// "važi do"/"važenja"/"trajanje"/"razdoblje") idu tek ako prvi sloj ne
// pronađe ništa - bez ovog prioriteta bi npr. "Trajanje osiguranja -
// Jednogodišnje" (praćeno POČETNIM datumom razdoblja, ne krajem) pogrešno
// pobijedilo nad stvarnim istekom koji se spominje kasnije u dokumentu -
// točno ovaj slučaj je testiran i potvrđen na Adriatic primjeru.
const EXPIRY_KEYWORD_TIERS = [
  ["istek", "isteka"],
  ["vrijedi do", "važi do", "važenja", "trajanje", "razdoblje"],
];

// PDF tekstualni sloj testirane police duplicira SVAKI redak (vidljivo u
// sirovom tekstu - svaki redak se pojavljuje dvaput zaredom, vjerojatno
// artefakt kako je dokument generiran). Bez uklanjanja duplikata, "sljedeći
// redak" nakon labela bi bio JOŠ JEDNA kopija labela, ne stvarna vrijednost
// koja dolazi tek dva retka niže. Deduplikacija susjednih identičnih redaka
// je no-op za dokumente bez ovog artefakta (sintetički testovi), pa je
// sigurna za sve slučajeve.
function dedupeConsecutiveLines(lines: string[]): string[] {
  const result: string[] = [];
  for (const line of lines) {
    if (result.length === 0 || result[result.length - 1] !== line) {
      result.push(line);
    }
  }
  return result;
}

// Uzima ZADNJI valjan datum u retku, ne prvi - "od X do Y" izrazi (npr.
// "Razdoblje osiguranja: od 15.03.2026. do 15.03.2027.") imaju DVA datuma
// u istom retku, i Y (kraj razdoblja) je taj koji nas zanima, ne X
// (početak).
function extractDateFromLine(line: string): string | undefined {
  const matches = line.match(DATE_PATTERN_GLOBAL);
  if (!matches) return undefined;
  const validDates = matches.map(parseHrDateToIso).filter((v): v is string => v !== null);
  return validDates.length > 0 ? validDates[validDates.length - 1] : undefined;
}

function findDateNearKeywords(lines: string[], keywords: string[]): string | undefined {
  const lowerKeywords = keywords.map((k) => k.toLowerCase());
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    if (!lowerKeywords.some((kw) => lower.includes(kw))) continue;

    const sameLine = extractDateFromLine(lines[i]);
    if (sameLine) return sameLine;

    if (i + 1 < lines.length) {
      const nextLine = extractDateFromLine(lines[i + 1]);
      if (nextLine) return nextLine;
    }
  }
  return undefined;
}

// Datum isteka registracije NIJE polje koje polica uvijek eksplicitno
// imenuje - hrvatske police obveznog osiguranja (AO) navode RAZDOBLJE
// OSIGURANJA (npr. "Istek godišnjeg osiguranja"), ne doslovno "istek
// registracije". Koristimo taj datum kao PROXY jer obvezno auto-osiguranje
// u HR standardno prati valjanost registracije (obnova registracije
// zahtijeva važeću policu za taj period) - ova pretpostavka NIJE formalno
// potvrđena za sve osiguravajuće kuće, samo je stvaran obrazac na
// testiranom Adriatic AO primjeru. Vidi PROGRESS.md arhitektonsku odluku
// "Polica osiguranja: istek osiguranja kao proxy za istek registracije".
function findExpiryDate(rawText: string): string | undefined {
  const lines = dedupeConsecutiveLines(rawText.split(/\r?\n/));
  for (const keywords of EXPIRY_KEYWORD_TIERS) {
    const found = findDateNearKeywords(lines, keywords);
    if (found) return found;
  }

  // Fallback - najkasniji valjan datum bilo gdje u dokumentu (slab signal,
  // ali bolji od praznog polja).
  const allDates = (rawText.match(DATE_PATTERN_GLOBAL) ?? [])
    .map(parseHrDateToIso)
    .filter((v): v is string => v !== null);
  return [...allDates].sort().at(-1);
}

function normalizePlate(value: string | undefined): string | undefined {
  return value ? value.replace(/[\s-]/g, "").toUpperCase() : undefined;
}

// Tablice/VIN se dodatno vade kao POMOĆNI, usporedni izvor uz postojeći OCR
// fotografije prometne (extractRegistrationDoc.ts, NETAKNUT ovom
// promjenom) - PDF tekstualni sloj police je pouzdaniji od slikovnog OCR-a
// fotografirane prometne (nema rizika krivog čitanja znakova), pa vlasnik
// može unakrsno provjeriti. Marka/model NAMJERNO nisu vađeni - polica ih
// navodi kao jedan spojen string (npr. "BMW, SERIJA 4 430I"), nema
// pouzdanog načina razdvojiti marku od modela/trima bez lomljivog nagađanja.
export function extractInsurancePolicyFields(rawText: string): InsurancePolicyOcrResult {
  const plateMatch = rawText.match(PLATE_PATTERN);
  return {
    registrationExpiresAt: findExpiryDate(rawText),
    licensePlate: normalizePlate(plateMatch?.[0]),
    vin: rawText.match(VIN_PATTERN)?.[0],
    rawText,
  };
}

export async function extractInsurancePolicyFromPdf(
  buffer: Buffer
): Promise<InsurancePolicyOcrResult> {
  const rawText = await extractPdfText(buffer);
  return extractInsurancePolicyFields(rawText);
}
