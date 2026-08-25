import { z } from "zod";

export const vehicleCostTypeSchema = z.enum(["leasing", "insurance", "kasko", "other"]);
export type VehicleCostType = z.infer<typeof vehicleCostTypeSchema>;

export const installmentFrequencySchema = z.enum(["monthly", "quarterly", "yearly"]);
export type InstallmentFrequency = z.infer<typeof installmentFrequencySchema>;

export const vehicleCostCreateSchema = z
  .object({
    vehicleId: z.string().min(1),
    costType: vehicleCostTypeSchema,
    customType: z.string().min(1).optional(),
    amount: z.coerce.number().positive(),
    isInstallment: z.boolean(),
    installmentFrequency: installmentFrequencySchema.optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    date: z.coerce.date().optional(),
  })
  .refine((d) => d.costType !== "other" || !!d.customType, {
    message: "customType je obavezan kad je costType 'other'",
    path: ["customType"],
  })
  .refine((d) => !d.isInstallment || (!!d.installmentFrequency && !!d.startDate), {
    message: "installmentFrequency i startDate su obavezni za ratu",
    path: ["installmentFrequency"],
  })
  .refine((d) => d.isInstallment || !!d.date, {
    message: "date je obavezan za jednokratan trošak",
    path: ["date"],
  })
  .refine((d) => !d.endDate || !d.startDate || d.endDate > d.startDate, {
    message: "endDate mora biti nakon startDate",
    path: ["endDate"],
  });
export type VehicleCostCreateInput = z.infer<typeof vehicleCostCreateSchema>;
