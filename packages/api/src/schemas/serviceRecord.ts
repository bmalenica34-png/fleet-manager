import { z } from "zod";

// partsCost/laborCost koriste z.coerce.number() (ne z.number()) - POST ruta
// prima ovo kao multipart/form-data (radi opcionalnog uploada računa u
// istom requestu), pa stiže kao string; coerce ga transparentno pretvara
// neovisno o pozivatelju. Prazan string coerce-a u 0 (Number("") === 0), pa
// "oba mogu biti 0 ako se ne primjenjuje" radi bez posebnog defaulta.
// NEMA "cost" polja ovdje - to je legacy (vidi schema.prisma), novi zapisi
// se uvijek uvode kroz partsCost+laborCost.
export const serviceRecordCreateSchema = z.object({
  vehicleId: z.string().min(1),
  date: z.coerce.date(),
  description: z.string().min(1),
  partsCost: z.coerce.number().min(0),
  laborCost: z.coerce.number().min(0),
  partsSupplier: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
});
export type ServiceRecordCreateInput = z.infer<typeof serviceRecordCreateSchema>;
