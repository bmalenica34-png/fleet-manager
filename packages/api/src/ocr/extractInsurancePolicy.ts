import { extractPdfText } from "./pdfText";
import { parseHrDateToIso } from "../lib/dateFormat";
import type { InsurancePolicyOcrResult } from "../schemas/ocr";

const DATE_PATTERN = /\d{1,2}\.\d{1,2}\.\d{4}\.?/g;

function findValidDatesInWindow(window: string): string[] {
  const matches = window.match(DATE_PATTERN) ?? [];
  return matches.map(parseHrDateToIso).filter((v): v is string => v !== null);
}

// Prozor se zaustavlja na SLJEDEĆEM retku (ne na fiksnom broju znakova) -
// bez ovoga bi prevelik prozor "pokupio" datum iz SLJEDEĆE, nepovezane
// rečenice (npr. "Razdoblje osiguranja: od X do Y" na jednom retku, pa
// "Premija dospijeva Z" na sljedećem - fiksni prozor od 100 znakova bi
// pogrešno uzeo Z umjesto Y kao "zadnji datum u prozoru"). `maxAfter` je
// samo sigurnosni gornji limit za dokumente bez prijeloma retka.
function findKeywordWindows(text: string, keyword: string, before = 40, maxAfter = 200): string[] {
  const lower = text.toLowerCase();
  const needle = keyword.toLowerCase();
  const windows: string[] = [];
  let index = lower.indexOf(needle);
  while (index !== -1) {
    const start = Math.max(0, index - before);
    const afterKeyword = index + needle.length;
    const nextNewline = text.indexOf("\n", afterKeyword);
    const cappedEnd = Math.min(text.length, afterKeyword + maxAfter);
    const end = nextNewline === -1 ? cappedEnd : Math.min(nextNewline, cappedEnd);
    windows.push(text.slice(start, end));
    index = lower.indexOf(needle, index + needle.length);
  }
  return windows;
}

// Redoslijed je namjerno od najspecifičnijeg ključnog izraza prema
// općenitijem - prvi izraz koji uspije pronaći VALJAN datum pobjeđuje.
// Claude NEMA potvrđeno znanje o točnom nazivu ovog polja na stvarnim
// hrvatskim policama osiguranja - ovo je prvi prolaz heuristike, gradio na
// domenskom razumijevanju (obvezno auto-osiguranje u HR standardno pokriva
// TOČNO isto razdoblje kao valjanost registracije), vjerojatno će trebati
// fino podešavanje protiv stvarnog dokumenta.
const REGISTRATION_KEYWORDS = [
  "istek registracije",
  "važenje prometne dozvole",
  "prometna dozvola vrijedi",
  "tehnički pregled",
  "vrijedi do",
  "važi do",
  "razdoblje osiguranja",
  "trajanje osiguranja",
];

// Datum isteka registracije NIJE polje koje polica uvijek eksplicitno
// imenuje - fallback stoga uzima najkasniji valjan datum bilo gdje u
// dokumentu (slab signal, ali bolji od praznog polja). Rezultat je PREFILL
// prijedlog - vlasnik uvijek pregleda i po potrebi ispravi prije spremanja.
export function extractInsurancePolicyFields(rawText: string): InsurancePolicyOcrResult {
  for (const keyword of REGISTRATION_KEYWORDS) {
    for (const window of findKeywordWindows(rawText, keyword)) {
      const dates = findValidDatesInWindow(window);
      if (dates.length > 0) {
        // Zadnji datum u prozoru - kod "razdoblje od X do Y" izraza, Y je
        // ono što nas zanima (datum do kojeg vrijedi, ne datum početka).
        return { registrationExpiresAt: dates[dates.length - 1], rawText };
      }
    }
  }

  const allDates = findValidDatesInWindow(rawText);
  const latest = [...allDates].sort().at(-1);
  return { registrationExpiresAt: latest, rawText };
}

export async function extractInsurancePolicyFromPdf(
  buffer: Buffer
): Promise<InsurancePolicyOcrResult> {
  const rawText = await extractPdfText(buffer);
  return extractInsurancePolicyFields(rawText);
}
