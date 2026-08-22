import { z } from "zod";

export const registrationDocOcrResultSchema = z.object({
  make: z.string().optional(),
  model: z.string().optional(),
  licensePlate: z.string().optional(),
  vin: z.string().optional(),
  rawText: z.string(),
});
export type RegistrationDocOcrResult = z.infer<typeof registrationDocOcrResultSchema>;

export const insurancePolicyOcrResultSchema = z.object({
  registrationExpiresAt: z.string().optional(),
  // Pomoćni, usporedni izvor uz OCR fotografije prometne - PDF tekstualni
  // sloj police je pouzdaniji od slikovnog OCR-a (nema rizika krivog
  // čitanja znakova).
  licensePlate: z.string().optional(),
  vin: z.string().optional(),
  rawText: z.string(),
});
export type InsurancePolicyOcrResult = z.infer<typeof insurancePolicyOcrResultSchema>;
