import { detectDocumentText } from "./vision";
import type { RegistrationDocOcrResult } from "../schemas/ocr";

// Hrvatska prometna dozvola koristi harmonizirane EU šifre polja - tražimo
// ih prve jer su najpouzdanije kad OCR uspije pohvatati oznaku uz vrijednost
// (npr. "D.1 RENAULT" ili "D.1\nRENAULT" na odvojenom retku).
function matchByCode(text: string, code: string): string | undefined {
  const escaped = code.replace(".", "\\.");
  // Kod mora biti sam na početku retka (uz eventualni razmak) - bez ovog
  // sidrišta "A" (registracijska oznaka) bi hvatao bilo koje slovo A usred
  // riječi bilo gdje u tekstu.
  const pattern = new RegExp(`^\\s*${escaped}\\b[.:\\)]?\\s*[\\r\\n]?\\s*([A-ZČĆŽŠĐ0-9][A-ZČĆŽŠĐa-zčćžšđ0-9\\-\\s]{1,40})`, "m");
  const match = text.match(pattern);
  return match?.[1]?.trim().split(/\s{2,}|[\r\n]/)[0]?.trim();
}

// Hrvatski VIN/broj šasije - 17 znakova, bez I/O/Q (ISO 3779).
function matchVin(text: string): string | undefined {
  const match = text.match(/\b[A-HJ-NPR-Z0-9]{17}\b/);
  return match?.[0];
}

// Hrvatska registarska oznaka - dva slova (oznaka županije) + 3-4 znamenke +
// 1-2 slova, s opcionalnim razmakom/crticom (npr. "ZG 1234 AB", "ZG1234AB").
function matchLicensePlate(text: string): string | undefined {
  const match = text.match(/\b([A-Z]{2})[\s-]?(\d{3,4})[\s-]?([A-Z]{1,2})\b/);
  if (!match) return undefined;
  return `${match[1]}${match[2]}${match[3]}`;
}

// Tablice/VIN nemaju razmake u praksi (registracija/šasija) - normalizacija
// uklanja razmake/crtice bez obzira je li vrijednost stigla iz šifre-polja
// (koja može uhvatiti "ZG 1234 AB" ako je OCR ubacio razmake) ili fallback
// regexa.
function normalizePlateOrVin(value: string | undefined): string | undefined {
  return value ? value.replace(/[\s-]/g, "").toUpperCase() : undefined;
}

// Ekstrahira marku/model/tablice/VIN iz OCR-anog teksta prometne dozvole.
// NAMJERNO ne vadi datum isteka registracije - na prometnoj je taj datum
// često prekriven pečatom (korisnikova eksplicitna napomena), pouzdaniji
// izvor je polica osiguranja (zaseban Tier 2 zadatak, PDF text-parsing).
// Rezultat je namijenjen kao PREFILL prijedlog - vlasnik uvijek pregleda i
// po potrebi ispravi prije spremanja, ne sprema se automatski.
export function extractRegistrationFields(rawText: string): RegistrationDocOcrResult {
  return {
    make: matchByCode(rawText, "D.1"),
    model: matchByCode(rawText, "D.3"),
    licensePlate: normalizePlateOrVin(matchByCode(rawText, "A") ?? matchLicensePlate(rawText)),
    vin: normalizePlateOrVin(matchByCode(rawText, "E") ?? matchVin(rawText)),
    rawText,
  };
}

export async function extractRegistrationDocFromImage(
  imageBuffer: Buffer
): Promise<RegistrationDocOcrResult> {
  const rawText = await detectDocumentText(imageBuffer);
  return extractRegistrationFields(rawText);
}
