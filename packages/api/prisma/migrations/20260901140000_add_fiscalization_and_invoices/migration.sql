-- Ručno napisana migracija (ne `prisma migrate dev`) - isti razlog kao
-- svih prijašnjih ručnih migracija u ovom repou.
--
-- Hrvatska fiskalizacija: FINA cert storage + PDV zastavica u
-- CompanySettings, novi Invoice model (fiskalizirani R1/R2 računi s
-- JIR/ZKI), veze na Contract/RentPayment/Client.

-- ── CompanySettings: fiskalizacijska polja ────────────────────────────────
ALTER TABLE "company_settings" ADD COLUMN "vatRegistered" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "company_settings" ADD COLUMN "finaCertBase64" TEXT;
ALTER TABLE "company_settings" ADD COLUMN "finaCertPassword" TEXT;
ALTER TABLE "company_settings" ADD COLUMN "finaOib" TEXT;
ALTER TABLE "company_settings" ADD COLUMN "finaPremiseLabel" TEXT;
ALTER TABLE "company_settings" ADD COLUMN "finaDeviceLabel" TEXT;
ALTER TABLE "company_settings" ADD COLUMN "finaPremiseStreet" TEXT;
ALTER TABLE "company_settings" ADD COLUMN "finaPremiseHouseNumber" TEXT;
ALTER TABLE "company_settings" ADD COLUMN "finaPremiseCity" TEXT;
ALTER TABLE "company_settings" ADD COLUMN "finaPremisePostalCode" TEXT;
ALTER TABLE "company_settings" ADD COLUMN "finaPremiseWorkHours" TEXT;
ALTER TABLE "company_settings" ADD COLUMN "finaPremiseRegisteredAt" TIMESTAMP(3);

-- ── Invoice ───────────────────────────────────────────────────────────────
CREATE TYPE "InvoiceType" AS ENUM ('R1', 'R2');
CREATE TYPE "InvoiceStatus" AS ENUM ('fiscalized', 'failed');

CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "brOznRac" INTEGER NOT NULL,
    "oznPosPr" TEXT NOT NULL,
    "oznNapUr" TEXT NOT NULL,
    "type" "InvoiceType" NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'failed',
    "rentPaymentId" TEXT,
    "contractId" TEXT,
    "clientId" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invoiceDateTime" TIMESTAMP(3) NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "netAmount" DOUBLE PRECISION NOT NULL,
    "vatAmount" DOUBLE PRECISION NOT NULL,
    "vatRate" DOUBLE PRECISION NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "oibIssuer" TEXT NOT NULL,
    "zki" TEXT NOT NULL,
    "jir" TEXT,
    "fiscalizedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "recipientName" TEXT NOT NULL,
    "recipientOib" TEXT,
    "recipientAddress" TEXT,
    "pdfKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invoices_rentPaymentId_key" ON "invoices"("rentPaymentId");
CREATE UNIQUE INDEX "invoices_year_oznPosPr_oznNapUr_brOznRac_key" ON "invoices"("year", "oznPosPr", "oznNapUr", "brOznRac");
CREATE INDEX "invoices_contractId_idx" ON "invoices"("contractId");
CREATE INDEX "invoices_clientId_idx" ON "invoices"("clientId");

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_rentPaymentId_fkey" FOREIGN KEY ("rentPaymentId") REFERENCES "rent_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
