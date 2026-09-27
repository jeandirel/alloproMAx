-- Migration rédigée à la main : la base de données de production est temporairement
-- injoignable depuis cet environnement (voir historique du projet), ce qui empêche
-- `prisma migrate dev` de générer ce diff via une shadow database. Ce fichier reflète
-- exactement la diff additive entre l'ancien et le nouveau prisma/schema.prisma
-- (aucun DROP, aucune perte de données, toutes les nouvelles colonnes sont
-- nullable ou dotées d'une valeur par défaut compatible avec les lignes existantes).
-- À appliquer via `prisma migrate deploy` dès que la connectivité DB est rétablie.

-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "accountStatus" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN "pausedAt" TIMESTAMP(3),
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "suspensionReason" TEXT,
  ADD COLUMN "suspendedById" TEXT,
  ADD COLUMN "deletionRequestedAt" TIMESTAMP(3),
  ADD COLUMN "deletionScheduledAt" TIMESTAMP(3),
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "authProvider" TEXT,
  ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "lastLoginAt" TIMESTAMP(3),
  ADD COLUMN "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "notifyBookingUpdates" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyMessages" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifySecurity" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyMarketing" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Professional"
  ADD COLUMN "paused" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "pausedAt" TIMESTAMP(3),
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "suspensionReason" TEXT,
  ADD COLUMN "suspendedById" TEXT,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Session"
  ADD COLUMN "userAgent" TEXT,
  ADD COLUMN "ipAddress" TEXT,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "PhoneOtp" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneOtp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PhoneOtp_phone_idx" ON "PhoneOtp"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE INDEX "User_accountStatus_idx" ON "User"("accountStatus");

-- CreateIndex
CREATE INDEX "User_deletionScheduledAt_idx" ON "User"("deletionScheduledAt");

-- CreateIndex
CREATE INDEX "Professional_paused_idx" ON "Professional"("paused");

-- CreateIndex
CREATE INDEX "Professional_deletedAt_idx" ON "Professional"("deletedAt");

-- CreateIndex
-- Peut déjà exister si un index équivalent avait été posé hors migrations suivies
-- (le schéma de base a été initialisé avant l'introduction du suivi de migrations) ;
-- à vérifier avec \d "Session" avant application si la commande échoue sur ce point.
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_suspendedById_fkey" FOREIGN KEY ("suspendedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Professional" ADD CONSTRAINT "Professional_suspendedById_fkey" FOREIGN KEY ("suspendedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
