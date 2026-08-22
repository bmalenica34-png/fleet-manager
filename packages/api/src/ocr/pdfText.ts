// Čita ugrađeni tekstualni sloj PDF-a (ne rendering/OCR) - police
// osiguranja su generirani dokumenti (iz sustava osiguravatelja), ne
// fotografije, pa imaju pravi tekstualni sloj i ne treba im Google Vision.
//
// pdf-parse (preko pdfjs-dist) je namjerno dodan i kao direktna ovisnost
// `apps/web`-a (ne samo `packages/api`) - pod pnpm strict izolacijom, Next-ov
// `experimental.serverComponentsExternalPackages` tracer ne uspijeva
// pouzdano pratiti/eksternalizirati paket koji je resolvable SAMO iz
// tranzitivne ovisnosti (`packages/api/node_modules`), ne i iz apps/web-a
// koji stvarno pokreće serverless funkciju. Vidi `next.config.mjs` za
// externalPackages unos i PROGRESS.md bug o ovome za pun dokazni lanac.
//
// UVOZ MORA BITI DINAMIČAN (unutar funkcije), NE statički top-level `import`
// - `packages/api/src/server/index.ts` je `export *` barrel, pa bi statički
// uvoz ovdje povukao pdf-parse/pdfjs-dist u SVAKU rutu koja uvozi bilo što
// iz `@rent-a-car/api/server` (npr. `/api/auth/owner/request-link`, koja
// nikad ne poziva OCR) - potvrđeno stvarnim produkcijskim padom (bug #43,
// vidi PROGRESS.md): `ReferenceError: DOMMatrix is not defined` iz
// pdfjs-dist-ovog modul-level polyfill pokušaja, na ruti koja s OCR-om nema
// nikakve veze, samo zato što je uvezena iz istog barrela. Dinamički uvoz
// odgađa evaluaciju pdf-parse modula do stvarnog poziva ove funkcije.
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}
