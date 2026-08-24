-- Ručno napisana migracija (ne `prisma migrate dev`) - isti razlog kao
-- migracija 20260824120000: shadow-DB replay pada na pre-postojećoj
-- 20260820073000_add_contract_number, pa se koristi `migrate deploy`
-- (bez shadow baze) izravno na produkcijsku bazu.

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('active', 'deactivated');

-- CreateEnum
CREATE TYPE "PermissionModule" AS ENUM ('contracts', 'vehicles', 'clients', 'invoicing', 'settings');

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'active',
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_email_key" ON "employees"("email");

-- CreateIndex
CREATE UNIQUE INDEX "employees_userId_key" ON "employees"("userId");

-- CreateTable
CREATE TABLE "employee_permissions" (
    "employeeId" TEXT NOT NULL,
    "module" "PermissionModule" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_permissions_pkey" PRIMARY KEY ("employeeId","module")
);

-- AddForeignKey
ALTER TABLE "employee_permissions" ADD CONSTRAINT "employee_permissions_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN "createdByEmployeeId" TEXT;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
