-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('draft', 'sent', 'signed', 'expired');

-- CreateEnum
CREATE TYPE "PhotoAngle" AS ENUM ('front', 'back', 'left', 'right', 'interior_dashboard', 'interior_seats', 'odometer', 'other');

-- CreateEnum
CREATE TYPE "AnnexStatus" AS ENUM ('draft', 'sent', 'signed', 'expired');

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER,
    "licensePlate" TEXT NOT NULL,
    "vin" TEXT,
    "registrationDocKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_images" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "oib" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "driverLicenseKey" TEXT,
    "idDocumentKey" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "dateFrom" TIMESTAMP(3) NOT NULL,
    "dateTo" TIMESTAMP(3) NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'draft',
    "signingToken" TEXT,
    "signingTokenExpiresAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "contractPdfKey" TEXT,
    "protocolPdfKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handover_photos" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "photoRequestId" TEXT,
    "angle" "PhotoAngle" NOT NULL,
    "key" TEXT NOT NULL,
    "damageDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "handover_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annexes" (
    "id" TEXT NOT NULL,
    "parentContractId" TEXT NOT NULL,
    "newDateTo" TIMESTAMP(3) NOT NULL,
    "status" "AnnexStatus" NOT NULL DEFAULT 'draft',
    "signingToken" TEXT,
    "signingTokenExpiresAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "annexPdfKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "annexes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photo_requests" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fulfilledAt" TIMESTAMP(3),

    CONSTRAINT "photo_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_licensePlate_key" ON "vehicles"("licensePlate");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_vin_key" ON "vehicles"("vin");

-- CreateIndex
CREATE UNIQUE INDEX "clients_oib_key" ON "clients"("oib");

-- CreateIndex
CREATE UNIQUE INDEX "clients_userId_key" ON "clients"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_signingToken_key" ON "contracts"("signingToken");

-- CreateIndex
CREATE INDEX "contracts_clientId_idx" ON "contracts"("clientId");

-- CreateIndex
CREATE INDEX "contracts_vehicleId_idx" ON "contracts"("vehicleId");

-- CreateIndex
CREATE INDEX "contracts_status_idx" ON "contracts"("status");

-- CreateIndex
CREATE INDEX "handover_photos_contractId_idx" ON "handover_photos"("contractId");

-- CreateIndex
CREATE INDEX "handover_photos_photoRequestId_idx" ON "handover_photos"("photoRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "annexes_signingToken_key" ON "annexes"("signingToken");

-- CreateIndex
CREATE INDEX "annexes_parentContractId_idx" ON "annexes"("parentContractId");

-- CreateIndex
CREATE INDEX "photo_requests_contractId_idx" ON "photo_requests"("contractId");

-- AddForeignKey
ALTER TABLE "vehicle_images" ADD CONSTRAINT "vehicle_images_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_photos" ADD CONSTRAINT "handover_photos_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover_photos" ADD CONSTRAINT "handover_photos_photoRequestId_fkey" FOREIGN KEY ("photoRequestId") REFERENCES "photo_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annexes" ADD CONSTRAINT "annexes_parentContractId_fkey" FOREIGN KEY ("parentContractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_requests" ADD CONSTRAINT "photo_requests_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
