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

// pdfjs-dist (u Node okruženju bez pravog Worker konteksta) samostalno
// pokušava "fake worker" - dinamički `import(this.workerSrc)` GDJE JE
// `workerSrc` runtime IZRAČUNATA vrijednost (varijabla), ne statički
// string literal. Next-ov file tracer (@vercel/nft) prati SAMO statičke
// import specifiere - dinamički import s izračunatom putanjom je za njega
// nevidljiv, pa `pdf.worker.mjs` (2MB, stvarno potreban fajl) nikad nije
// uključen u Vercel serverless bundle. Potvrđeno stvarnim produkcijskim
// padom (bug #45 dodatak, vidi PROGRESS.md): DOMMatrix fix je riješio
// PRVI crash, ali odmah nakon njega isti poziv pukne na `Error: Setting
// up fake worker failed: "Cannot find module '.../pdf.worker.mjs'"`.
//
// Rješenje koristi pdfjs-dist-ov SLUŽBENI izlaz za točno ovaj slučaj: ako
// je `globalThis.pdfjsWorker.WorkerMessageHandler` već postavljen,
// pdfjs-dist preskače dinamički import u potpunosti i koristi njega
// izravno (vidi `PDFWorker.#mainThreadWorkerMessageHandler` u
// `pdfjs-dist/legacy/build/pdf.mjs`). Naš `import("pdfjs-dist/legacy/
// build/pdf.worker.mjs")` OVDJE je i dalje dinamički (zadržava odgodu iz
// buga #43 - ne izvršava se dok se ova funkcija stvarno ne pozove), ali
// specifier je statički STRING LITERAL, pa GA Next-ov tracer MOŽE pratiti
// i uključiti u bundle - razlika je isključivo u tome je li putanja
// literal ili varijabla, ne u tome je li import statički ili dinamički.
let workerGlobalReady: Promise<void> | null = null;
async function ensurePdfjsWorkerGlobal(): Promise<void> {
  const target = globalThis as { pdfjsWorker?: unknown };
  if (target.pdfjsWorker) return;
  if (!workerGlobalReady) {
    workerGlobalReady = import("pdfjs-dist/legacy/build/pdf.worker.mjs").then((mod) => {
      target.pdfjsWorker = { WorkerMessageHandler: mod.WorkerMessageHandler };
    });
  }
  await workerGlobalReady;
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  ensurePdfjsNodePolyfills();
  await ensurePdfjsWorkerGlobal();
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}
