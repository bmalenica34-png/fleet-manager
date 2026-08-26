-- Ručno napisana migracija (ne `prisma migrate dev`) - isti razlog kao
-- svih prijašnjih ručnih migracija u ovom repou.

-- AlterTable
-- "cost" postaje nullable - LEGACY polje za stare zapise (prije parts/labor
-- splita), nikad se više ne piše za nove zapise (vidi schema.prisma komentar
-- i server/serviceRecords.ts serviceRecordTotal()). Postojeći redovi
-- zadržavaju svoju vrijednost u "cost" nepromijenjenu.
ALTER TABLE "service_records" ALTER COLUMN "cost" DROP NOT NULL;
ALTER TABLE "service_records" ADD COLUMN "partsCost" DOUBLE PRECISION;
ALTER TABLE "service_records" ADD COLUMN "laborCost" DOUBLE PRECISION;
