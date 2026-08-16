-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "insurancePolicyKey" TEXT,
ADD COLUMN     "registrationExpiresAt" TIMESTAMP(3),
ADD COLUMN     "registrationReminder0SentAt" TIMESTAMP(3),
ADD COLUMN     "registrationReminder3SentAt" TIMESTAMP(3),
ADD COLUMN     "registrationReminder7SentAt" TIMESTAMP(3);
