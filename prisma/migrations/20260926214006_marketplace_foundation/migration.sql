-- Fondation du marketplace transactionnel (ServiceRequest -> Offer -> Booking,
-- deblocage de contact, paiements/versements reels, grand livre append-only).
-- Entierement additif : aucun DROP, toutes les nouvelles colonnes sont
-- nullable ou dotees d'une valeur par defaut compatible avec les lignes
-- existantes. Genere par `prisma migrate diff` puis applique via
-- `prisma migrate deploy` (shell non interactif : `migrate dev` refuse de
-- s'executer hors TTY).

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "offerId" TEXT,
ADD COLUMN     "offerSnapshotId" TEXT,
ADD COLUMN     "serviceRequestId" TEXT;

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "commissionBpsOverride" INTEGER;

-- AlterTable
ALTER TABLE "Payout" ADD COLUMN     "providerFeeActual" INTEGER DEFAULT 0;

-- AlterTable
ALTER TABLE "ServiceSubcategory" ADD COLUMN     "commissionBpsOverride" INTEGER;

-- CreateTable
CREATE TABLE "MarketplaceSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "platformCommissionBps" INTEGER NOT NULL DEFAULT 700,
    "contactUnlockFeeAmount" INTEGER NOT NULL DEFAULT 500,
    "currency" TEXT NOT NULL DEFAULT 'XAF',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "MarketplaceSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRequest" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "subcategoryId" TEXT,
    "catalogServiceId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "address" TEXT,
    "quartier" TEXT,
    "neighborhoodId" TEXT,
    "budgetMinAmount" INTEGER,
    "budgetMaxAmount" INTEGER,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "preferredDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRequestAttachment" (
    "id" TEXT NOT NULL,
    "serviceRequestId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceRequestAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "serviceRequestId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "previousOfferId" TEXT,
    "amount" INTEGER NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferSnapshot" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "grossAmount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XAF',
    "platformCommissionBps" INTEGER NOT NULL,
    "platformFeeAmount" INTEGER NOT NULL,
    "professionalNetAmount" INTEGER NOT NULL,
    "settingsVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactUnlock" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XAF',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "unlockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactUnlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookingId" TEXT,
    "contactUnlockId" TEXT,
    "kind" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XAF',
    "provider" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "depositId" TEXT,
    "failureCode" TEXT,
    "checkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentProviderEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "paymentAttemptId" TEXT,
    "payload" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentProviderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT,
    "contactUnlockId" TEXT,
    "payoutId" TEXT,
    "paymentAttemptId" TEXT,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XAF',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompletionProof" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "autoCompleteDeadline" TIMESTAMP(3) NOT NULL,
    "clientConfirmedAt" TIMESTAMP(3),
    "autoCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompletionProof_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceRequest_clientId_status_idx" ON "ServiceRequest"("clientId", "status");

-- CreateIndex
CREATE INDEX "ServiceRequest_categoryId_status_idx" ON "ServiceRequest"("categoryId", "status");

-- CreateIndex
CREATE INDEX "ServiceRequest_status_idx" ON "ServiceRequest"("status");

-- CreateIndex
CREATE INDEX "ServiceRequest_expiresAt_idx" ON "ServiceRequest"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRequestAttachment_assetId_key" ON "ServiceRequestAttachment"("assetId");

-- CreateIndex
CREATE INDEX "ServiceRequestAttachment_serviceRequestId_idx" ON "ServiceRequestAttachment"("serviceRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "Offer_previousOfferId_key" ON "Offer"("previousOfferId");

-- CreateIndex
CREATE INDEX "Offer_serviceRequestId_status_idx" ON "Offer"("serviceRequestId", "status");

-- CreateIndex
CREATE INDEX "Offer_professionalId_status_idx" ON "Offer"("professionalId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OfferSnapshot_offerId_key" ON "OfferSnapshot"("offerId");

-- CreateIndex
CREATE INDEX "OfferSnapshot_offerId_idx" ON "OfferSnapshot"("offerId");

-- CreateIndex
CREATE INDEX "ContactUnlock_clientId_professionalId_idx" ON "ContactUnlock"("clientId", "professionalId");

-- CreateIndex
CREATE INDEX "ContactUnlock_professionalId_status_idx" ON "ContactUnlock"("professionalId", "status");

-- CreateIndex
CREATE INDEX "PaymentAttempt_status_idx" ON "PaymentAttempt"("status");

-- CreateIndex
CREATE INDEX "PaymentAttempt_userId_idx" ON "PaymentAttempt"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_bookingId_kind_attempt_key" ON "PaymentAttempt"("bookingId", "kind", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_contactUnlockId_kind_attempt_key" ON "PaymentAttempt"("contactUnlockId", "kind", "attempt");

-- CreateIndex
CREATE INDEX "PaymentProviderEvent_paymentAttemptId_idx" ON "PaymentProviderEvent"("paymentAttemptId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProviderEvent_provider_providerEventId_key" ON "PaymentProviderEvent"("provider", "providerEventId");

-- CreateIndex
CREATE INDEX "LedgerEntry_bookingId_idx" ON "LedgerEntry"("bookingId");

-- CreateIndex
CREATE INDEX "LedgerEntry_contactUnlockId_idx" ON "LedgerEntry"("contactUnlockId");

-- CreateIndex
CREATE INDEX "LedgerEntry_type_idx" ON "LedgerEntry"("type");

-- CreateIndex
CREATE INDEX "LedgerEntry_createdAt_idx" ON "LedgerEntry"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompletionProof_bookingId_key" ON "CompletionProof"("bookingId");

-- CreateIndex
CREATE INDEX "CompletionProof_autoCompleteDeadline_idx" ON "CompletionProof"("autoCompleteDeadline");

-- CreateIndex
CREATE INDEX "Refund_bookingId_idx" ON "Refund"("bookingId");

-- CreateIndex
CREATE INDEX "Refund_status_idx" ON "Refund"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_serviceRequestId_key" ON "Booking"("serviceRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_offerId_key" ON "Booking"("offerId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_offerSnapshotId_key" ON "Booking"("offerSnapshotId");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_serviceRequestId_fkey" FOREIGN KEY ("serviceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_offerSnapshotId_fkey" FOREIGN KEY ("offerSnapshotId") REFERENCES "OfferSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceSettings" ADD CONSTRAINT "MarketplaceSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "ServiceSubcategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_catalogServiceId_fkey" FOREIGN KEY ("catalogServiceId") REFERENCES "CatalogService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_neighborhoodId_fkey" FOREIGN KEY ("neighborhoodId") REFERENCES "Neighborhood"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequestAttachment" ADD CONSTRAINT "ServiceRequestAttachment_serviceRequestId_fkey" FOREIGN KEY ("serviceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceRequestAttachment" ADD CONSTRAINT "ServiceRequestAttachment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "UploadedAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_serviceRequestId_fkey" FOREIGN KEY ("serviceRequestId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_previousOfferId_fkey" FOREIGN KEY ("previousOfferId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferSnapshot" ADD CONSTRAINT "OfferSnapshot_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactUnlock" ADD CONSTRAINT "ContactUnlock_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactUnlock" ADD CONSTRAINT "ContactUnlock_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_contactUnlockId_fkey" FOREIGN KEY ("contactUnlockId") REFERENCES "ContactUnlock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentProviderEvent" ADD CONSTRAINT "PaymentProviderEvent_paymentAttemptId_fkey" FOREIGN KEY ("paymentAttemptId") REFERENCES "PaymentAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_contactUnlockId_fkey" FOREIGN KEY ("contactUnlockId") REFERENCES "ContactUnlock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_paymentAttemptId_fkey" FOREIGN KEY ("paymentAttemptId") REFERENCES "PaymentAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletionProof" ADD CONSTRAINT "CompletionProof_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompletionProof" ADD CONSTRAINT "CompletionProof_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

