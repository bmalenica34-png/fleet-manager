import { z } from "zod";

export const termsCreateSchema = z.object({
  content: z.string().min(1),
});
export type TermsCreateInput = z.infer<typeof termsCreateSchema>;
