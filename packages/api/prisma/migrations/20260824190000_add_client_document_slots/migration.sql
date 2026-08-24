-- Ručno napisana migracija (ne `prisma migrate dev`) - isti razlog kao
-- prijašnja četiri nastavka: shadow-DB replay pada na pre-postojećoj
-- migraciji 20260820073000_add_contract_number, pa se koristi
-- `migrate deploy` (bez shadow baze) izravno na produkcijsku bazu.

-- AlterTable
ALTER TABLE "clients" ADD COLUMN "idDocumentFrontKey" TEXT;
ALTER TABLE "clients" ADD COLUMN "idDocumentBackKey" TEXT;
ALTER TABLE "clients" ADD COLUMN "driverLicenseFrontKey" TEXT;
ALTER TABLE "clients" ADD COLUMN "driverLicenseBackKey" TEXT;
