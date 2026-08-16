import { z } from "zod";

export const annexStatusSchema = z.enum(["draft", "sent", "signed", "expired"]);
export type AnnexStatus = z.infer<typeof annexStatusSchema>;

export const annexCreateSchema = z.object({
  parentContractId: z.string().min(1),
  newDateTo: z.coerce.date(),
});
export type AnnexCreateInput = z.infer<typeof annexCreateSchema>;
