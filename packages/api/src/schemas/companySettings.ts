import { z } from "zod";

export const companySettingsUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  oib: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  email: z.string().email().optional(),
});
export type CompanySettingsUpdateInput = z.infer<typeof companySettingsUpdateSchema>;
