import { z } from "zod";

export const reportFrequencySchema = z.enum(["off", "daily", "weekly", "monthly", "custom"]);
export type ReportFrequency = z.infer<typeof reportFrequencySchema>;

export const companySettingsUpdateSchema = z
  .object({
    name: z.string().min(1).optional(),
    oib: z.string().min(1).optional(),
    address: z.string().min(1).optional(),
    phone: z.string().min(1).optional(),
    email: z.string().email().optional(),
    reportFrequency: reportFrequencySchema.optional(),
    reportCustomIntervalDays: z.number().int().min(1).max(365).optional(),
    reportEmailEnabled: z.boolean().optional(),
    // ── Fiskalizacija ──────────────────────────────────────────────────────
    vatRegistered: z.boolean().optional(),
    finaCertPassword: z.string().optional(), // "" dopušten (cert bez zaporke)
    finaOib: z.string().regex(/^\d{11}$/, "OIB mora imati 11 znamenki").optional(),
    finaPremiseLabel: z.string().min(1).max(20).optional(),
    finaDeviceLabel: z.string().min(1).max(20).optional(),
    finaPremiseStreet: z.string().min(1).optional(),
    finaPremiseHouseNumber: z.string().min(1).optional(),
    finaPremiseCity: z.string().min(1).optional(),
    finaPremisePostalCode: z.string().min(1).optional(),
    finaPremiseWorkHours: z.string().min(1).optional(),
  })
  .refine((data) => data.reportFrequency !== "custom" || data.reportCustomIntervalDays != null, {
    message: "reportCustomIntervalDays je obavezan kad je reportFrequency 'custom'",
    path: ["reportCustomIntervalDays"],
  });
export type CompanySettingsUpdateInput = z.infer<typeof companySettingsUpdateSchema>;
