-- AlterTable
ALTER TABLE "photo_requests" ADD COLUMN     "requestToken" TEXT,
ADD COLUMN     "requestTokenExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "photo_requests_requestToken_key" ON "photo_requests"("requestToken");
