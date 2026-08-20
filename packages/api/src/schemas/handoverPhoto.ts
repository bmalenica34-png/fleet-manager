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

export const vehiclePartSchema = z.enum([
  "front_bumper",
  "rear_bumper",
  "hood",
  "trunk",
  "roof",
  "windshield",
  "rear_window",
  "left_front_door",
  "left_rear_door",
  "right_front_door",
  "right_rear_door",
  "left_front_fender",
  "right_front_fender",
  "left_rear_fender",
  "right_rear_fender",
  "left_mirror",
  "right_mirror",
  "left_front_wheel",
  "right_front_wheel",
  "left_rear_wheel",
  "right_rear_wheel",
  "headlight_left",
  "headlight_right",
  "taillight_left",
  "taillight_right",
  "interior",
  "other",
]);
export type VehiclePart = z.infer<typeof vehiclePartSchema>;

export const handoverPhotoCreateSchema = z.object({
  contractId: z.string().min(1),
  photoRequestId: z.string().min(1).optional(),
  angle: photoAngleSchema,
  key: z.string().min(1),
  damageDescription: z.string().max(1000).optional(),
  damagedPart: vehiclePartSchema.optional(),
});
export type HandoverPhotoCreateInput = z.infer<typeof handoverPhotoCreateSchema>;
