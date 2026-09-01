import { z } from "zod";

// OIB - hrvatski identifikacijski broj, 11 znamenki. Isti format za fizičku
// osobu i za tvrtku (kod `type: "pravna"` ovo je OIB tvrtke).
const oibSchema = z.string().regex(/^\d{11}$/, "OIB mora imati točno 11 znamenki");

export const clientTypeSchema = z.enum(["fizicka", "pravna"]);
export type ClientType = z.infer<typeof clientTypeSchema>;

// Sirovi objekt (bez refina) - iz njega izvodimo i create i partial update.
const clientFieldsSchema = z.object({
  // Default "fizicka" - stari klijenti/pozivi bez ovog polja ostaju fizičke
  // osobe, ponašanje nepromijenjeno.
  type: clientTypeSchema.default("fizicka"),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  oib: oibSchema,
  // Popunjeno samo za pravnu osobu (naziv i adresa sjedišta iz sudskog
  // registra ili ručno). Za fizičku osobu ostaje prazno.
  companyName: z.string().min(1).optional(),
  companyAddress: z.string().min(1).optional(),
  // Lowercase odmah pri unosu - Client.email se koristi za case-insensitive
  // povezivanje s Supabase auth računom pri loginu (linkGuestClientsToUser).
  email: z.string().email().toLowerCase(),
  phone: z.string().min(1),
  address: z.string().min(1).optional(),
  idNumber: z.string().min(1).optional(),
  driverLicenseNumber: z.string().min(1).optional(),
  birthDate: z.coerce.date().optional(),
  driverLicenseKey: z.string().min(1).optional(),
  idDocumentKey: z.string().min(1).optional(),
});

// Za pravnu osobu naziv firme je obavezan (OIB je već obavezan kroz oibSchema).
const requireCompanyNameForPravna = (
  data: { type?: ClientType; companyName?: string },
  ctx: z.RefinementCtx
) => {
  if (data.type === "pravna" && !data.companyName?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["companyName"],
      message: "Naziv firme je obavezan za pravnu osobu",
    });
  }
};

export const clientCreateSchema = clientFieldsSchema.superRefine(requireCompanyNameForPravna);
export type ClientCreateInput = z.infer<typeof clientCreateSchema>;

export const clientUpdateSchema = clientFieldsSchema.partial().superRefine(requireCompanyNameForPravna);
export type ClientUpdateInput = z.infer<typeof clientUpdateSchema>;

// Dokumenti klijenta (osobna/vozačka, obje strane) - upravljani sa stranice
// klijenta, odvojeno od create/update forme iznad. Vidi server/clients.ts.
export const CLIENT_DOCUMENT_SLOTS = [
  "idDocumentFront",
  "idDocumentBack",
  "driverLicenseFront",
  "driverLicenseBack",
] as const;
export const clientDocumentSlotSchema = z.enum(CLIENT_DOCUMENT_SLOTS);
export type ClientDocumentSlot = z.infer<typeof clientDocumentSlotSchema>;
