-- CreateEnum
CREATE TYPE "VehiclePart" AS ENUM ('front_bumper', 'rear_bumper', 'hood', 'trunk', 'roof', 'windshield', 'rear_window', 'left_front_door', 'left_rear_door', 'right_front_door', 'right_rear_door', 'left_front_fender', 'right_front_fender', 'left_rear_fender', 'right_rear_fender', 'left_mirror', 'right_mirror', 'left_front_wheel', 'right_front_wheel', 'left_rear_wheel', 'right_rear_wheel', 'headlight_left', 'headlight_right', 'taillight_left', 'taillight_right', 'interior', 'other');

-- AlterTable
ALTER TABLE "handover_photos" ADD COLUMN     "damagedPart" "VehiclePart";
