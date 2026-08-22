// Duplikat packages/api/src/ocr/pdfjs-worker.d.ts - apps/web-ov tsconfig
// `include` ne seže izvan vlastitog direktorija, pa ambient deklaracija iz
// packages/api nije vidljiva ovdje čak i kad se pdfText.ts (koji je uvozi)
// type-checka kao dio apps/web kompilacije. pdfjs-dist ne izvozi tipove za
// ovaj duboki subpath (worker build) - samo nam treba `WorkerMessageHandler`
// prisutan na modulu, vidi packages/api/src/ocr/pdfText.ts.
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
