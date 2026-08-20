// Prikaz datuma korisniku je uvijek hrvatski format DD.MM.GGGG. (s točkom
// na kraju) - interno (baza, API pozivi) datumi ostaju ISO (GGGG-MM-DD).
// Ove funkcije su granica konverzije, zajedničke za web i mobile.

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * ISO datum (ili Date objekt) -> "DD.MM.GGGG." za prikaz. Koristi lokalne
 * (ne UTC) komponente datuma - izbjegava off-by-one pomak kad je ISO string
 * poput "2026-08-19" bez vremena (new Date() ga parsira kao UTC ponoć, pa bi
 * getDate() u zapadnijim vremenskim zonama vratio prethodni dan).
 */
export function formatDateHr(value: string | Date): string {
  const date = typeof value === "string" ? parseIsoDateLocal(value) : value;
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()}.`;
}

/** ISO datum ("GGGG-MM-DD", opcionalno s vremenom) -> "DD.MM.GGGG." tekstualni input. */
export function isoToHrDate(value: string): string {
  return formatDateHr(value);
}

/**
 * "DD.MM.GGGG." (točka na kraju opcionalna, dozvoljava i jednoznamenkaste
 * dan/mjesec) -> "GGGG-MM-DD", ili null ako format/datum nije validan
 * (npr. "31.02.2026." - 31. veljače ne postoji).
 */
export function parseHrDateToIso(value: string): string | null {
  const match = value.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\.?$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return `${year}-${pad2(month)}-${pad2(day)}`;
}

// "GGGG-MM-DD..." prefiks parsiran kao lokalni datum (ponoć u lokalnoj
// zoni), ne kao UTC (što bi new Date("GGGG-MM-DD") inače napravila).
function parseIsoDateLocal(value: string): Date {
  const [datePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  return new Date(year, month - 1, day);
}
