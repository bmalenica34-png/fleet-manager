-- Ručno napisana migracija (ne `prisma migrate dev`) - isti razlog kao
-- svih prijašnjih ručnih migracija u ovom repou.

-- AlterTable
ALTER TABLE "service_records" ADD COLUMN "partsSupplier" TEXT;
