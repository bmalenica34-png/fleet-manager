import { z } from "zod";

// OIB - hrvatski osobni identifikacijski broj, 11 znamenki.
const oibSchema = z.string().regex(/^\d{11}$/, "OIB mora imati točno 11 znamenki");

export const clientCreateSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  oib: oibSchema,
  // Lowercase odmah pri unosu - Client.email se koristi za case-insensitive
  // povezivanje s Supabase auth računom pri loginu (linkGuestClientsToUser).
  email: z.string().email().toLowerCase(),
  phone: z.string().min(1),
  driverLicenseKey: z.string().min(1).optional(),
  idDocumentKey: z.string().min(1).optional(),
});
export type ClientCreateInput = z.infer<typeof clientCreateSchema>;

export const clientUpdateSchema = clientCreateSchema.partial();
export type ClientUpdateInput = z.infer<typeof clientUpdateSchema>;
