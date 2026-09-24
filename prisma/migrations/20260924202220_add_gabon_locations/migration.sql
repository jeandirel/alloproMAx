-- AlterTable
ALTER TABLE "Address" ADD COLUMN     "cityId" TEXT,
ADD COLUMN     "neighborhoodId" TEXT,
ADD COLUMN     "provinceId" TEXT;

-- AlterTable
ALTER TABLE "Professional" ADD COLUMN     "cityId" TEXT,
ADD COLUMN     "neighborhoodId" TEXT,
ADD COLUMN     "provinceId" TEXT;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "neighborhoodId" TEXT;

-- CreateTable
CREATE TABLE "Province" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'GA',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Province_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "provinceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Neighborhood" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Neighborhood_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LocationSuggestion" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provinceId" TEXT,
    "cityId" TEXT,
    "proposedName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "extraInfo" TEXT,
    "submittedBy" TEXT,
    "submitterEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "adminComment" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Province_slug_key" ON "Province"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Province_normalizedName_key" ON "Province"("normalizedName");

-- CreateIndex
CREATE INDEX "Province_countryCode_idx" ON "Province"("countryCode");

-- CreateIndex
CREATE INDEX "City_provinceId_idx" ON "City"("provinceId");

-- CreateIndex
CREATE INDEX "City_slug_idx" ON "City"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "City_provinceId_normalizedName_key" ON "City"("provinceId", "normalizedName");

-- CreateIndex
CREATE INDEX "Neighborhood_cityId_idx" ON "Neighborhood"("cityId");

-- CreateIndex
CREATE INDEX "Neighborhood_slug_idx" ON "Neighborhood"("slug");

-- CreateIndex
CREATE INDEX "Neighborhood_normalizedName_idx" ON "Neighborhood"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "Neighborhood_cityId_normalizedName_key" ON "Neighborhood"("cityId", "normalizedName");

-- CreateIndex
CREATE INDEX "LocationSuggestion_status_idx" ON "LocationSuggestion"("status");

-- CreateIndex
CREATE INDEX "LocationSuggestion_type_status_idx" ON "LocationSuggestion"("type", "status");

-- CreateIndex
CREATE INDEX "LocationSuggestion_normalizedName_idx" ON "LocationSuggestion"("normalizedName");

-- CreateIndex
CREATE INDEX "Address_provinceId_idx" ON "Address"("provinceId");

-- CreateIndex
CREATE INDEX "Address_cityId_idx" ON "Address"("cityId");

-- CreateIndex
CREATE INDEX "Address_neighborhoodId_idx" ON "Address"("neighborhoodId");

-- CreateIndex
CREATE INDEX "Professional_provinceId_idx" ON "Professional"("provinceId");

-- CreateIndex
CREATE INDEX "Professional_cityId_idx" ON "Professional"("cityId");

-- CreateIndex
CREATE INDEX "Professional_neighborhoodId_idx" ON "Professional"("neighborhoodId");

-- CreateIndex
CREATE INDEX "Booking_neighborhoodId_idx" ON "Booking"("neighborhoodId");

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_provinceId_fkey" FOREIGN KEY ("provinceId") REFERENCES "Province"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_neighborhoodId_fkey" FOREIGN KEY ("neighborhoodId") REFERENCES "Neighborhood"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Professional" ADD CONSTRAINT "Professional_provinceId_fkey" FOREIGN KEY ("provinceId") REFERENCES "Province"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Professional" ADD CONSTRAINT "Professional_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Professional" ADD CONSTRAINT "Professional_neighborhoodId_fkey" FOREIGN KEY ("neighborhoodId") REFERENCES "Neighborhood"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_neighborhoodId_fkey" FOREIGN KEY ("neighborhoodId") REFERENCES "Neighborhood"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "City" ADD CONSTRAINT "City_provinceId_fkey" FOREIGN KEY ("provinceId") REFERENCES "Province"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Neighborhood" ADD CONSTRAINT "Neighborhood_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationSuggestion" ADD CONSTRAINT "LocationSuggestion_provinceId_fkey" FOREIGN KEY ("provinceId") REFERENCES "Province"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationSuggestion" ADD CONSTRAINT "LocationSuggestion_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationSuggestion" ADD CONSTRAINT "LocationSuggestion_submittedBy_fkey" FOREIGN KEY ("submittedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LocationSuggestion" ADD CONSTRAINT "LocationSuggestion_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

