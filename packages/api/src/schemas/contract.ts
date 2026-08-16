import { z } from "zod";

export const contractStatusSchema = z.enum(["draft", "sent", "signed", "expired"]);
export type ContractStatus = z.infer<typeof contractStatusSchema>;

export const contractCreateSchema = z
  .object({
    vehicleId: z.string().min(1),
    clientId: z.string().min(1),
    dateFrom: z.coerce.date(),
    dateTo: z.coerce.date(),
  })
  .refine((data) => data.dateTo > data.dateFrom, {
    message: "dateTo mora biti nakon dateFrom",
    path: ["dateTo"],
  });
export type ContractCreateInput = z.infer<typeof contractCreateSchema>;

export const contractUpdateSchema = z.object({
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  status: contractStatusSchema.optional(),
});
export type ContractUpdateInput = z.infer<typeof contractUpdateSchema>;
