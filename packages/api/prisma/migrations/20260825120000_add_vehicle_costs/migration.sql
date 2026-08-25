-- Ručno napisana migracija (ne `prisma migrate dev`) - isti razlog kao
-- prijašnjih dvanaest nastavaka: shadow-DB replay pada na pre-postojećoj
-- migraciji 20260820073000_add_contract_number, pa se koristi
-- `migrate deploy` (bez shadow baze) izravno na produkcijsku bazu.

-- CreateEnum
CREATE TYPE "VehicleCostType" AS ENUM ('leasing', 'insurance', 'kasko', 'other');

-- CreateEnum
CREATE TYPE "InstallmentFrequency" AS ENUM ('monthly', 'quarterly', 'yearly');

-- CreateTable
CREATE TABLE "vehicle_costs" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "costType" "VehicleCostType" NOT NULL,
    "customType" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "isInstallment" BOOLEAN NOT NULL DEFAULT false,
    "installmentFrequency" "InstallmentFrequency",
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "date" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_costs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicle_costs_vehicleId_idx" ON "vehicle_costs"("vehicleId");

-- AddForeignKey
ALTER TABLE "vehicle_costs" ADD CONSTRAINT "vehicle_costs_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
