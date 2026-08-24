-- Ručno napisana migracija (ne `prisma migrate dev`) - isti razlog kao
-- prijašnjih devet nastavaka: shadow-DB replay pada na pre-postojećoj
-- migraciji 20260820073000_add_contract_number, pa se koristi
-- `migrate deploy` (bez shadow baze) izravno na produkcijsku bazu.

-- CreateTable
CREATE TABLE "service_records" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "provider" TEXT,
    "receiptKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_records_vehicleId_idx" ON "service_records"("vehicleId");

-- AddForeignKey
ALTER TABLE "service_records" ADD CONSTRAINT "service_records_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
