// pdfjs-dist ne izvozi tipove za ovaj duboki subpath (worker build) - samo
// nam treba `WorkerMessageHandler` prisutan na modulu, vidi pdfText.ts.
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
