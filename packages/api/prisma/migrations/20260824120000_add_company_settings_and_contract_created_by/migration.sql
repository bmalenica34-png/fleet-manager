-- Ručno napisana migracija (ne `prisma migrate dev`) - shadow-DB replay
-- pada na ranijoj migraciji 20260820073000_add_contract_number
-- (`setval` s 0 na praznoj shadow bazi je izvan dozvoljenog raspona
-- sekvence), pretpostojeći bug otkriven pri pokušaju ove migracije, ne
-- nešto vezano uz ovu promjenu - izbjegnuto ručnim pisanjem SQL-a i
-- `migrate deploy` (bez shadow baze) umjesto `migrate dev`.

-- CreateTable
CREATE TABLE "company_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "name" TEXT,
    "oib" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "logoKey" TEXT,
    "digitalCertificateKey" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN "createdByOwnerId" TEXT;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_createdByOwnerId_fkey" FOREIGN KEY ("createdByOwnerId") REFERENCES "owners"("id") ON DELETE SET NULL ON UPDATE CASCADE;
