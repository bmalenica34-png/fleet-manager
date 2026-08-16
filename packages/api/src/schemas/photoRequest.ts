import { z } from "zod";

export const photoRequestCreateSchema = z.object({
  contractId: z.string().min(1),
});
export type PhotoRequestCreateInput = z.infer<typeof photoRequestCreateSchema>;
