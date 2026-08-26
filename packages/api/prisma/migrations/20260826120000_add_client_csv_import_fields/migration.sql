-- Ručno napisana migracija (ne `prisma migrate dev`) - isti razlog kao
-- prijašnjih migracija: shadow-DB replay pada na pre-postojećim ručno
-- napisanim migracijama, pa se koristi `migrate deploy` (bez shadow baze)
-- izravno na produkcijsku bazu.

-- AlterTable
ALTER TABLE "clients" ADD COLUMN "idNumber" TEXT;
ALTER TABLE "clients" ADD COLUMN "driverLicenseNumber" TEXT;
ALTER TABLE "clients" ADD COLUMN "birthDate" TIMESTAMP(3);
ALTER TABLE "clients" ADD COLUMN "hasIncompleteData" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "clients" ADD COLUMN "incompleteReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "clients" ADD COLUMN "incompleteDataNotifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "clients_idNumber_key" ON "clients"("idNumber");
