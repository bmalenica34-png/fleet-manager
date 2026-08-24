import { z } from "zod";

export const vehicleCreateSchema = z.object({
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().min(1950).max(new Date().getFullYear() + 1).optional(),
  licensePlate: z.string().min(1),
  vin: z.string().min(1).optional(),
  registrationDocKey: z.string().min(1).optional(),
  registrationExpiresAt: z.coerce.date().optional(),
  underService: z.boolean().optional(),
});
export type VehicleCreateInput = z.infer<typeof vehicleCreateSchema>;

export const vehicleUpdateSchema = vehicleCreateSchema.partial();
export type VehicleUpdateInput = z.infer<typeof vehicleUpdateSchema>;

export const vehicleImageCreateSchema = z.object({
  vehicleId: z.string().min(1),
  key: z.string().min(1),
});
export type VehicleImageCreateInput = z.infer<typeof vehicleImageCreateSchema>;
