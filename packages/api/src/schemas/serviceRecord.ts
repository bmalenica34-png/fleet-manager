import { z } from "zod";

// cost koristi z.coerce.number() (ne z.number()) - POST ruta prima ovo kao
// multipart/form-data (radi opcionalnog uploada računa u istom requestu), pa
// stiže kao string; coerce ga transparentno pretvara neovisno o pozivatelju.
export const serviceRecordCreateSchema = z.object({
  vehicleId: z.string().min(1),
  date: z.coerce.date(),
  description: z.string().min(1),
  cost: z.coerce.number().min(0),
  provider: z.string().min(1).optional(),
});
export type ServiceRecordCreateInput = z.infer<typeof serviceRecordCreateSchema>;
