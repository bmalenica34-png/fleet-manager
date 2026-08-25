-- Ručno napisana migracija (ne `prisma migrate dev`) - isti razlog kao
-- prijašnjih jedanaest nastavaka: shadow-DB replay pada na pre-postojećoj
-- migraciji 20260820073000_add_contract_number, pa se koristi
-- `migrate deploy` (bez shadow baze) izravno na produkcijsku bazu.

-- CreateEnum
CREATE TYPE "ReportFrequency" AS ENUM ('off', 'daily', 'weekly', 'monthly', 'custom');

-- AlterTable
ALTER TABLE "company_settings" ADD COLUMN "reportFrequency" "ReportFrequency" NOT NULL DEFAULT 'off';
ALTER TABLE "company_settings" ADD COLUMN "reportCustomIntervalDays" INTEGER;
ALTER TABLE "company_settings" ADD COLUMN "reportEmailEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "company_settings" ADD COLUMN "lastReportSentAt" TIMESTAMP(3);
