import { z } from "zod";
import { photoAngleSchema, vehiclePartSchema } from "./handoverPhoto";

// Klijent uploada dokumente/slike izravno u Hetzner (presigned PUT) prije
// finalnog submita - ova shema je za "daj mi upload URL" korak, ne za
// finalni submit. Vidi bug #37 u PROGRESS.md - direktan upload zamjenjuje
// stari multipart-kroz-Vercel-funkciju pristup koji je udarao u ~4.5MB
// platformski limit.
export const signUploadRequestSchema = z
  .object({
    purpose: z.enum(["driverLicense", "idDocument", "photo", "damagePhoto"]),
    filename: z.string().min(1).max(200),
    contentType: z.string().regex(/^image\//, "contentType mora biti image/*"),
    angle: photoAngleSchema.optional(),
  })
  .refine((data) => data.purpose !== "photo" || data.angle, {
    message: "angle je obavezan za purpose='photo'",
    path: ["angle"],
  });
export type SignUploadRequestInput = z.infer<typeof signUploadRequestSchema>;

const signPhotoSchema = z.object({
  angle: photoAngleSchema,
  key: z.string().min(1),
  damageDescription: z.string().max(1000).optional(),
});

const signDamagePhotoSchema = z.object({
  part: vehiclePartSchema,
  key: z.string().min(1),
  description: z.string().max(1000).optional(),
});

// Finalni submit - sad malen JSON (samo ključevi već uploadanih fajlova +
// metapodaci), ne više multipart s binarnim sadržajem fajlova.
export const completeSigningRequestSchema = z.object({
  phone: z.string().min(1),
  address: z.string().min(1).optional(),
  termsAccepted: z.literal(true),
  termsVersion: z.string().min(1),
  driverLicenseKey: z.string().min(1),
  idDocumentKey: z.string().min(1),
  photos: z.array(signPhotoSchema),
  damagePhotos: z.array(signDamagePhotoSchema),
  signature: z.string().min(1),
});
export type CompleteSigningRequestInput = z.infer<typeof completeSigningRequestSchema>;
