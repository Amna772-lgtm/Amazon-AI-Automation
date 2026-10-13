-- Phase 2 (Agent 1: Product Research) was removed from the project.
-- Drops its tables and enums; Phase 1 tables are untouched.

-- DropTable
DROP TABLE IF EXISTS "CriterionEvaluation" CASCADE;
DROP TABLE IF EXISTS "ProductEvaluation" CASCADE;
DROP TABLE IF EXISTS "ProductMetric" CASCADE;
DROP TABLE IF EXISTS "ProductVariation" CASCADE;
DROP TABLE IF EXISTS "AmazonProduct" CASCADE;
DROP TABLE IF EXISTS "Seller" CASCADE;
DROP TABLE IF EXISTS "CriteriaProfile" CASCADE;

-- DropEnum
DROP TYPE IF EXISTS "CriterionResult";
DROP TYPE IF EXISTS "ValueKind";
DROP TYPE IF EXISTS "VerificationStatus";
DROP TYPE IF EXISTS "ReviewStatus";
