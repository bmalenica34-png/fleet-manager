// Lagan RFC4180-ish CSV parser (bez vanjske ovisnosti - format je jednostavan
// fiksni skup kolona, nema potrebe za punom bibliotekom poput papaparse).
// Auto-detektira delimiter (zarez ili točka-zarez) po zaglavlju - hr-HR
// Excel lokal po defaultu koristi točka-zarez pri "Save As CSV" jer je zarez
// decimalni separator, pa predložak (zarez) i dalje treba raditi ako ga
// korisnik otvori/spremi u Excelu s tom lokalizacijom.

function splitCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

/** Parsira CSV tekst u niz redaka, ključevi su lowercase-trimani zaglavlja. */
export function parseCsv(text: string): Record<string, string>[] {
  const cleaned = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // skini BOM ako postoji
  const lines = cleaned.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const headerLine = lines[0];
  const semicolons = (headerLine.match(/;/g) ?? []).length;
  const commas = (headerLine.match(/,/g) ?? []).length;
  const delimiter = semicolons > commas ? ";" : ",";

  const headers = splitCsvLine(headerLine, delimiter).map((h) => h.trim().toLowerCase());

  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line, delimiter);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (values[i] ?? "").trim();
    });
    return row;
  });
}
