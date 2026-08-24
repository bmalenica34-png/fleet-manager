-- Ručno napisana migracija (ne `prisma migrate dev`) - isti razlog kao
-- prijašnjih sedam nastavaka: shadow-DB replay pada na pre-postojećoj
-- migraciji 20260820073000_add_contract_number, pa se koristi
-- `migrate deploy` (bez shadow baze) izravno na produkcijsku bazu.

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN "underService" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN "closedAt" TIMESTAMP(3);
ALTER TABLE "contracts" ADD COLUMN "actualEndDate" TIMESTAMP(3);
