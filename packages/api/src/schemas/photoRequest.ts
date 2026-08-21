import { z } from "zod";
import { photoAngleSchema } from "./handoverPhoto";

export const photoRequestCreateSchema = z.object({
  contractId: z.string().min(1),
});
export type PhotoRequestCreateInput = z.infer<typeof photoRequestCreateSchema>;

// Direct-to-storage upload (isti obrazac kao /api/sign/[token]/upload-url,
// vidi bugove #37/#38 u PROGRESS.md) - klijent uploada svaku sliku izravno
// u Hetzner, ovo je samo "daj mi upload URL" korak.
export const photoRequestUploadRequestSchema = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.string().regex(/^image\//, "contentType mora biti image/*"),
  angle: photoAngleSchema,
});
export type PhotoRequestUploadRequestInput = z.infer<typeof photoRequestUploadRequestSchema>;

// Finalni submit - malen JSON (ključevi već uploadanih fajlova), ne
// multipart s binarnim sadržajem.
export const completePhotoRequestRequestSchema = z.object({
  photos: z.array(
    z.object({
      angle: photoAngleSchema,
      key: z.string().min(1),
      damageDescription: z.string().max(1000).optional(),
    })
  ),
});
export type CompletePhotoRequestRequestInput = z.infer<typeof completePhotoRequestRequestSchema>;
