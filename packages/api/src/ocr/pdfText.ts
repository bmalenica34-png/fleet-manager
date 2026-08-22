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

// pdfjs-dist (preko pdf-parse) pokušava polyfill-ati DOMMatrix/Path2D/
// ImageData preko opcionalnog `@napi-rs/canvas` paketa - koji nije
// instaliran (namjerno, ne trebamo pravi rendering, samo getText()), pa
// pdfjs-dist pada natrag na VLASTITI manualni polyfill pokušaj. Taj
// fallback je pokvaren u ovoj verziji (baca umjesto da tiho degradira) -
// potvrđeno stvarnim produkcijskim padom (bug #45, vidi PROGRESS.md):
// `ReferenceError: DOMMatrix is not defined` na Vercelovom Linux
// serverless runtimeu (lokalni Windows next build/start to NE
// reproducira - razlog nije utvrđen, ali fix je isti bez obzira na uzrok).
// Rješenje: sami postavimo minimalne stub-ove PRIJE uvoza - dovoljni su
// jer nam ne treba stvarna matrica/canvas funkcionalnost za čistu
// tekst-ekstrakciju, samo da pdfjs-dist-ov modul-level kod prestane
// pucati na referenci koja ne postoji. Uvjetno (`typeof === "undefined"`)
// da ne prepiše pravu implementaciju ako je ikad dostupna (npr. ako se
// @napi-rs/canvas doda kao ovisnost u budućnosti).
function ensurePdfjsNodePolyfills(): void {
  const target = globalThis as Record<string, unknown>;
  if (typeof target.DOMMatrix === "undefined") {
    target.DOMMatrix = class DOMMatrixStub {
      multiply(): this {
        return this;
      }
      translate(): this {
        return this;
      }
      scale(): this {
        return this;
      }
      inverse(): this {
        return this;
      }
    };
  }
  if (typeof target.Path2D === "undefined") {
    target.Path2D = class Path2DStub {};
  }
  if (typeof target.ImageData === "undefined") {
    target.ImageData = class ImageDataStub {};
  }
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  ensurePdfjsNodePolyfills();
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}
