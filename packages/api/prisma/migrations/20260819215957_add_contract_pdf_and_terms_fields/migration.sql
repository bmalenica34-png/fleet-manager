-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "address" TEXT;

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "excessAmount" DOUBLE PRECISION,
ADD COLUMN     "odometerEnd" INTEGER,
ADD COLUMN     "odometerStart" INTEGER,
ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "pickupLocation" TEXT,
ADD COLUMN     "pricePerDay" DOUBLE PRECISION,
ADD COLUMN     "returnLocation" TEXT,
ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsVersion" TEXT;
