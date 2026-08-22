// Zajednički regex obrasci za VIN/tablice - dijeljeni između OCR-a
// prometne (Vision, fotografija) i police osiguranja (pdf-parse, pravi
// tekstualni sloj) jer oba trebaju identičnu validaciju formata.

// VIN/broj šasije - 17 znakova, bez I/O/Q (ISO 3779).
export const VIN_PATTERN = /\b[A-HJ-NPR-Z0-9]{17}\b/;

// Hrvatska registarska oznaka - dva slova (oznaka županije) + 3-4 znamenke
// + 1-2 slova, s opcionalnim razmakom/crticom (npr. "ZG 1234 AB",
// "ZG1234AB", "ZG 1278-JI").
export const PLATE_PATTERN = /\b([A-Z]{2})[\s-]?(\d{3,4})[\s-]?([A-Z]{1,2})\b/;
