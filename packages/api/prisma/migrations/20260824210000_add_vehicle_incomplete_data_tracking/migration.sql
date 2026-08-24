-- Ručno napisana migracija (ne `prisma migrate dev`) - isti razlog kao
-- prijašnjih šest nastavaka: shadow-DB replay pada na pre-postojećoj
-- migraciji 20260820073000_add_contract_number, pa se koristi
-- `migrate deploy` (bez shadow baze) izravno na produkcijsku bazu.

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN "hasIncompleteData" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "vehicles" ADD COLUMN "incompleteReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "vehicles" ADD COLUMN "incompleteDataNotifiedAt" TIMESTAMP(3);
