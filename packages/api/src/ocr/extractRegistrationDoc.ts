import { detectDocumentText } from "./vision";
import type { RegistrationDocOcrResult } from "../schemas/ocr";

const VIN_PATTERN = /\b[A-HJ-NPR-Z0-9]{17}\b/;
const PLATE_PATTERN = /\b([A-Z]{2})[\s-]?(\d{3,4})[\s-]?([A-Z]{1,2})\b/;

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

// Vraća tekst KOJI SLIJEDI iza svake pojave šifre polja (ne samo prve) -
// dokumenti često imaju i legendu koja objašnjava svaku šifru (npr. "E -
// Identifikacijski broj vozila"), koja bi bila lažni prvi pogodak da se
// gleda samo prvo pojavljivanje. Provjera svih pojava + validacija formata
// vrijednosti (VIN/tablice) omogućuje da se legenda preskoči i nastavi na
// sljedeću pojavu koja stvarno sadrži traženi format.
function findCodeValueWindows(text: string, code: string, windowChars = 150): string[] {
  const escaped = code.replace(".", "\\.");
  const pattern = new RegExp(`^\\s*${escaped}\\b[.:\\)]?\\s*`, "gm");
  const windows: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const start = match.index + match[0].length;
    windows.push(text.slice(start, start + windowChars));
  }
  return windows;
}

// VIN/broj šasije - 17 znakova, bez I/O/Q (ISO 3779). Prvo traži uz EU
// harmoniziranu šifru "E" (svaka pojava, ne samo prva - vidi
// findCodeValueWindows), i PRIHVAĆA samo tekst koji stvarno izgleda kao
// VIN prije nego ga vrati - bez ove validacije, legenda uz šifru E (koja
// nije VIN, nego objašnjenje što E znači) bi se lažno prihvatila kao
// vrijednost. Fallback na sken cijelog dokumenta je zadnje sredstvo, i
// dalje strogo validiran istim formatom pa ne hvata proizvoljan tekst.
function matchVin(text: string): string | undefined {
  for (const window of findCodeValueWindows(text, "E")) {
    const found = window.match(VIN_PATTERN);
    if (found) return found[0];
  }
  return text.match(VIN_PATTERN)?.[0];
}

// Hrvatska registarska oznaka - dva slova (oznaka županije) + 3-4 znamenke +
// 1-2 slova, s opcionalnim razmakom/crticom (npr. "ZG 1234 AB", "ZG1234AB").
// Isti obrazac kao matchVin: prvo pokuša uz šifru "A", validirano formatom,
// pa fallback na cijeli dokument (vanjska strana prometne standardno
// prikazuje tablice veliko i jasno, pa je ovaj fallback često dovoljan i
// bez ijedne šifre).
function matchLicensePlate(text: string): string | undefined {
  for (const window of findCodeValueWindows(text, "A")) {
    const found = window.match(PLATE_PATTERN);
    if (found) return `${found[1]}${found[2]}${found[3]}`;
  }
  const match = text.match(PLATE_PATTERN);
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

// Unutarnja strana prometne dozvole - tablica s harmoniziranim EU šiframa
// (marka/model/VIN). NAMJERNO ne pokušava tablice - unutarnja strana ih
// nikad ne sadrži (vidi extractRegistrationOuterFields za to), i NAMJERNO
// ne vadi datum isteka registracije - taj datum je na prometnoj često
// prekriven pečatom (korisnikova eksplicitna napomena), pouzdaniji izvor
// je polica osiguranja (zaseban Tier 2 zadatak). Rezultat je PREFILL
// prijedlog - vlasnik uvijek pregleda i po potrebi ispravi prije spremanja,
// ne sprema se automatski.
export function extractRegistrationInnerFields(rawText: string): RegistrationDocOcrResult {
  return {
    make: matchByCode(rawText, "D.1"),
    model: matchByCode(rawText, "D.3"),
    vin: normalizePlateOrVin(matchVin(rawText)),
    rawText,
  };
}

// Vanjska strana prometne dozvole - cilj je isključivo registracijska
// oznaka (tablice), koja je na ovoj strani standardno prikazana veliko i
// jasno (pa i sam fallback bez šifre-polja obično radi pouzdano).
export function extractRegistrationOuterFields(rawText: string): RegistrationDocOcrResult {
  return {
    licensePlate: normalizePlateOrVin(matchLicensePlate(rawText)),
    rawText,
  };
}

export async function extractRegistrationInnerFromImage(
  imageBuffer: Buffer
): Promise<RegistrationDocOcrResult> {
  const rawText = await detectDocumentText(imageBuffer);
  return extractRegistrationInnerFields(rawText);
}

export async function extractRegistrationOuterFromImage(
  imageBuffer: Buffer
): Promise<RegistrationDocOcrResult> {
  const rawText = await detectDocumentText(imageBuffer);
  return extractRegistrationOuterFields(rawText);
}
