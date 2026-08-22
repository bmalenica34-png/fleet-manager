import { PDFParse } from "pdf-parse";

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
// externalPackages unos i PROGRESS.md bug o ovome za pun dokazni lanac
// (potvrđeno stvarnom runtime greškom - "Object.defineProperty called on
// non-object" bez ovog fixa - ne pretpostavkom).
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}
