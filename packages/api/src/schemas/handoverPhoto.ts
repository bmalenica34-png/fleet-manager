import { z } from "zod";

export const photoAngleSchema = z.enum([
  "front",
  "back",
  "left",
  "right",
  "interior_dashboard",
  "interior_seats",
  "odometer",
  "other",
]);
export type PhotoAngle = z.infer<typeof photoAngleSchema>;

// Minimalni set kutova koji mora biti pokriven prije potpisa ugovora.
export const requiredHandoverAngles: PhotoAngle[] = ["front", "back", "left", "right"];

export const handoverPhotoCreateSchema = z.object({
  contractId: z.string().min(1),
  photoRequestId: z.string().min(1).optional(),
  angle: photoAngleSchema,
  key: z.string().min(1),
  damageDescription: z.string().max(1000).optional(),
});
export type HandoverPhotoCreateInput = z.infer<typeof handoverPhotoCreateSchema>;
