-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "Service" ADD COLUMN     "catalogServiceId" TEXT;

-- CreateTable
CREATE TABLE "ServiceSubcategory" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceSubcategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogService" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "subcategoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "description" TEXT,
    "keywords" TEXT[],
    "synonyms" TEXT[],
    "searchCount" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfessionalService" (
    "id" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priceFrom" INTEGER,
    "priceType" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfessionalService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceSuggestion" (
    "id" TEXT NOT NULL,
    "proposedName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "categoryId" TEXT,
    "subcategoryId" TEXT,
    "description" TEXT,
    "submittedBy" TEXT,
    "submitterEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "adminComment" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceSubcategory_categoryId_idx" ON "ServiceSubcategory"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceSubcategory_categoryId_normalizedName_key" ON "ServiceSubcategory"("categoryId", "normalizedName");

-- CreateIndex
CREATE INDEX "CatalogService_categoryId_idx" ON "CatalogService"("categoryId");

-- CreateIndex
CREATE INDEX "CatalogService_subcategoryId_idx" ON "CatalogService"("subcategoryId");

-- CreateIndex
CREATE INDEX "CatalogService_slug_idx" ON "CatalogService"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogService_subcategoryId_normalizedName_key" ON "CatalogService"("subcategoryId", "normalizedName");

-- CreateIndex
CREATE INDEX "ProfessionalService_professionalId_idx" ON "ProfessionalService"("professionalId");

-- CreateIndex
CREATE INDEX "ProfessionalService_serviceId_idx" ON "ProfessionalService"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfessionalService_professionalId_serviceId_key" ON "ProfessionalService"("professionalId", "serviceId");

-- CreateIndex
CREATE INDEX "ServiceSuggestion_status_idx" ON "ServiceSuggestion"("status");

-- CreateIndex
CREATE INDEX "ServiceSuggestion_normalizedName_idx" ON "ServiceSuggestion"("normalizedName");

-- CreateIndex
CREATE INDEX "Service_catalogServiceId_idx" ON "Service"("catalogServiceId");

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_catalogServiceId_fkey" FOREIGN KEY ("catalogServiceId") REFERENCES "CatalogService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceSubcategory" ADD CONSTRAINT "ServiceSubcategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogService" ADD CONSTRAINT "CatalogService_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogService" ADD CONSTRAINT "CatalogService_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "ServiceSubcategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalService" ADD CONSTRAINT "ProfessionalService_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "Professional"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfessionalService" ADD CONSTRAINT "ProfessionalService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "CatalogService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceSuggestion" ADD CONSTRAINT "ServiceSuggestion_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceSuggestion" ADD CONSTRAINT "ServiceSuggestion_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "ServiceSubcategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceSuggestion" ADD CONSTRAINT "ServiceSuggestion_submittedBy_fkey" FOREIGN KEY ("submittedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceSuggestion" ADD CONSTRAINT "ServiceSuggestion_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

