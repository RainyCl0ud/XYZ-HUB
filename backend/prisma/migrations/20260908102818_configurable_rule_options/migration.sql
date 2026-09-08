/*
  Warnings:

  - You are about to drop the column `severitySnapshot` on the `Incident` table. All the data in the column will be lost.
  - You are about to drop the column `weightSnapshot` on the `Incident` table. All the data in the column will be lost.
  - You are about to drop the column `severity` on the `RuleVersion` table. All the data in the column will be lost.
  - You are about to drop the column `weight` on the `RuleVersion` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Incident" DROP COLUMN "severitySnapshot",
DROP COLUMN "weightSnapshot",
ADD COLUMN     "severityNameSnapshot" TEXT,
ADD COLUMN     "weightNameSnapshot" TEXT,
ADD COLUMN     "weightValueSnapshot" INTEGER;

-- AlterTable
ALTER TABLE "RuleVersion" DROP COLUMN "severity",
DROP COLUMN "weight",
ADD COLUMN     "severityNameSnapshot" TEXT,
ADD COLUMN     "severityOptionId" TEXT,
ADD COLUMN     "weightNameSnapshot" TEXT,
ADD COLUMN     "weightOptionId" TEXT,
ADD COLUMN     "weightValueSnapshot" INTEGER;

-- DropEnum
DROP TYPE "Severity";

-- CreateTable
CREATE TABLE "SeverityOption" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeverityOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeightOption" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" INTEGER,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeightOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeverityOption_isActive_idx" ON "SeverityOption"("isActive");

-- CreateIndex
CREATE INDEX "SeverityOption_sortOrder_idx" ON "SeverityOption"("sortOrder");

-- CreateIndex
CREATE INDEX "WeightOption_isActive_idx" ON "WeightOption"("isActive");

-- CreateIndex
CREATE INDEX "WeightOption_sortOrder_idx" ON "WeightOption"("sortOrder");

-- CreateIndex
CREATE INDEX "RuleVersion_severityOptionId_idx" ON "RuleVersion"("severityOptionId");

-- CreateIndex
CREATE INDEX "RuleVersion_weightOptionId_idx" ON "RuleVersion"("weightOptionId");

-- AddForeignKey
ALTER TABLE "RuleVersion" ADD CONSTRAINT "RuleVersion_severityOptionId_fkey" FOREIGN KEY ("severityOptionId") REFERENCES "SeverityOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleVersion" ADD CONSTRAINT "RuleVersion_weightOptionId_fkey" FOREIGN KEY ("weightOptionId") REFERENCES "WeightOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
