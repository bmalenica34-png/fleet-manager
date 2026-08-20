import { z } from "zod";

export const contractStatusSchema = z.enum(["draft", "sent", "signed", "expired"]);
export type ContractStatus = z.infer<typeof contractStatusSchema>;

// Podaci za Contract PDF (najam - cijena, kilometraža, lokacija) - poznati
// owneru pri kreiranju ugovora, prije primopredaje. Ostala polja opcionalna
// (nisu bila dio izvornog v1 scope-a, PDF prikazuje "—" ako nedostaju) -
// pricePerDay je obavezan na create (vidi contractCreateSchema), jer se
// koristi za obračun na PDF-u.
const contractPdfFieldsSchema = z.object({
  pickupLocation: z.string().min(1).optional(),
  returnLocation: z.string().min(1).optional(),
  odometerStart: z.number().int().min(0).optional(),
  odometerEnd: z.number().int().min(0).optional(),
  pricePerDay: z.number().min(0).optional(),
  excessAmount: z.number().min(0).optional(),
  paymentMethod: z.string().min(1).optional(),
});

export const contractCreateSchema = z
  .object({
    vehicleId: z.string().min(1),
    clientId: z.string().min(1),
    dateFrom: z.coerce.date(),
    dateTo: z.coerce.date(),
  })
  .merge(contractPdfFieldsSchema)
  .extend({
    pricePerDay: z.number().positive(),
  })
  .refine((data) => data.dateTo > data.dateFrom, {
    message: "dateTo mora biti nakon dateFrom",
    path: ["dateTo"],
  });
export type ContractCreateInput = z.infer<typeof contractCreateSchema>;

export const contractUpdateSchema = z
  .object({
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
    status: contractStatusSchema.optional(),
  })
  .merge(contractPdfFieldsSchema);
export type ContractUpdateInput = z.infer<typeof contractUpdateSchema>;
