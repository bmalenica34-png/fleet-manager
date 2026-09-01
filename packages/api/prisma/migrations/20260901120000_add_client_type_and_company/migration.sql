-- Ručno napisana migracija (ne `prisma migrate dev`) - isti razlog kao
-- svih prijašnjih ručnih migracija u ovom repou.

-- Tip klijenta: fizička (default, postojeći redovi nepromijenjeni) / pravna.
-- Za pravnu osobu `clients.oib` drži OIB tvrtke, a companyName/companyAddress
-- podatke sjedišta (auto-popunjeni preko sudskog registra).

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('fizicka', 'pravna');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN "type" "ClientType" NOT NULL DEFAULT 'fizicka';
ALTER TABLE "clients" ADD COLUMN "companyName" TEXT;
ALTER TABLE "clients" ADD COLUMN "companyAddress" TEXT;
