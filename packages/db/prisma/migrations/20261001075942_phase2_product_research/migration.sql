-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "CriterionResult" AS ENUM ('QUALIFIED', 'NOT_QUALIFIED', 'NEEDS_REVIEW', 'DATA_UNAVAILABLE');

-- CreateEnum
CREATE TYPE "ValueKind" AS ENUM ('ACTUAL', 'ESTIMATED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('VERIFIED', 'UNVERIFIED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "CriteriaProfile" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "thresholds" JSONB NOT NULL,
    "weights" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CriteriaProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Seller" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "amazonSellerId" TEXT NOT NULL,
    "name" TEXT,
    "profileUrl" TEXT,
    "isAmazon" BOOLEAN NOT NULL DEFAULT false,
    "ratingPercent" DOUBLE PRECISION,
    "reviewCount" INTEGER,
    "feedback" JSONB,
    "businessName" TEXT,
    "businessAddress" TEXT,
    "amazonVerification" "VerificationStatus" NOT NULL DEFAULT 'UNKNOWN',
    "amazonEvidence" JSONB,
    "businessVerification" "VerificationStatus" NOT NULL DEFAULT 'UNKNOWN',
    "businessEvidence" JSONB,
    "websiteVerification" "VerificationStatus" NOT NULL DEFAULT 'UNKNOWN',
    "websiteEvidence" JSONB,
    "dataSource" TEXT,
    "observedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Seller_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmazonProduct" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "importRowId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "asin" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "brand" TEXT,
    "category" TEXT,
    "priceAmount" DOUBLE PRECISION,
    "priceCurrency" TEXT,
    "sellerId" TEXT,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedByEmail" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "overallScore" DOUBLE PRECISION,
    "analysedAt" TIMESTAMP(3),
    "dataProvider" TEXT,
    "researchError" TEXT,
    "jobId" TEXT,
    "stockBest" DOUBLE PRECISION,
    "sales90d" DOUBLE PRECISION,
    "reviews90d" DOUBLE PRECISION,
    "variationCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AmazonProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "childAsin" TEXT NOT NULL,
    "attributes" JSONB NOT NULL,
    "available" BOOLEAN,

    CONSTRAINT "ProductVariation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductMetric" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "valueNumber" DOUBLE PRECISION,
    "valueText" TEXT,
    "kind" "ValueKind" NOT NULL,
    "source" TEXT,
    "confidence" DOUBLE PRECISION,
    "note" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductEvaluation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "criteriaProfileId" TEXT,
    "criteriaSnapshot" JSONB NOT NULL,
    "overallScore" DOUBLE PRECISION,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CriterionEvaluation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "criterion" TEXT NOT NULL,
    "result" "CriterionResult" NOT NULL,
    "observedValue" TEXT,
    "threshold" TEXT,
    "weight" DOUBLE PRECISION NOT NULL,
    "points" DOUBLE PRECISION,
    "explanation" TEXT NOT NULL,

    CONSTRAINT "CriterionEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CriteriaProfile_workspaceId_name_key" ON "CriteriaProfile"("workspaceId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Seller_workspaceId_marketplace_amazonSellerId_key" ON "Seller"("workspaceId", "marketplace", "amazonSellerId");

-- CreateIndex
CREATE INDEX "AmazonProduct_workspaceId_projectId_reviewStatus_idx" ON "AmazonProduct"("workspaceId", "projectId", "reviewStatus");

-- CreateIndex
CREATE INDEX "AmazonProduct_workspaceId_fileId_idx" ON "AmazonProduct"("workspaceId", "fileId");

-- CreateIndex
CREATE INDEX "AmazonProduct_sellerId_idx" ON "AmazonProduct"("sellerId");

-- CreateIndex
CREATE UNIQUE INDEX "AmazonProduct_projectId_marketplace_asin_key" ON "AmazonProduct"("projectId", "marketplace", "asin");

-- CreateIndex
CREATE INDEX "ProductVariation_productId_idx" ON "ProductVariation"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductMetric_productId_metric_key" ON "ProductMetric"("productId", "metric");

-- CreateIndex
CREATE INDEX "ProductEvaluation_productId_idx" ON "ProductEvaluation"("productId");

-- CreateIndex
CREATE INDEX "CriterionEvaluation_evaluationId_idx" ON "CriterionEvaluation"("evaluationId");

-- CreateIndex
CREATE INDEX "CriterionEvaluation_workspaceId_criterion_result_idx" ON "CriterionEvaluation"("workspaceId", "criterion", "result");

-- AddForeignKey
ALTER TABLE "CriteriaProfile" ADD CONSTRAINT "CriteriaProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seller" ADD CONSTRAINT "Seller_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmazonProduct" ADD CONSTRAINT "AmazonProduct_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmazonProduct" ADD CONSTRAINT "AmazonProduct_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmazonProduct" ADD CONSTRAINT "AmazonProduct_importRowId_fkey" FOREIGN KEY ("importRowId") REFERENCES "ImportRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmazonProduct" ADD CONSTRAINT "AmazonProduct_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Seller"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariation" ADD CONSTRAINT "ProductVariation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariation" ADD CONSTRAINT "ProductVariation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "AmazonProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMetric" ADD CONSTRAINT "ProductMetric_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductMetric" ADD CONSTRAINT "ProductMetric_productId_fkey" FOREIGN KEY ("productId") REFERENCES "AmazonProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductEvaluation" ADD CONSTRAINT "ProductEvaluation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductEvaluation" ADD CONSTRAINT "ProductEvaluation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "AmazonProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriterionEvaluation" ADD CONSTRAINT "CriterionEvaluation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriterionEvaluation" ADD CONSTRAINT "CriterionEvaluation_evaluationId_fkey" FOREIGN KEY ("evaluationId") REFERENCES "ProductEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
