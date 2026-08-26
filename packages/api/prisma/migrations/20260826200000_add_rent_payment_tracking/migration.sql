-- Ručno napisana migracija (ne `prisma migrate dev`) - isti razlog kao
-- svih prijašnjih ručnih migracija u ovom repou.

-- CreateEnum
CREATE TYPE "PaymentFrequency" AS ENUM ('daily', 'weekly', 'monthly');

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN "depositAmount" DOUBLE PRECISION;
ALTER TABLE "contracts" ADD COLUMN "paymentFrequency" "PaymentFrequency" NOT NULL DEFAULT 'daily';

-- CreateTable
CREATE TABLE "rent_payments" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3),
    "ownerDueNotifiedAt" TIMESTAMP(3),
    "clientOverdueNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rent_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rent_payments_contractId_idx" ON "rent_payments"("contractId");

-- CreateIndex
CREATE INDEX "rent_payments_dueDate_idx" ON "rent_payments"("dueDate");

-- AddForeignKey
ALTER TABLE "rent_payments" ADD CONSTRAINT "rent_payments_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
