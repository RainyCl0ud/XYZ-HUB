-- CreateEnum
CREATE TYPE "ChatterStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'RESOLVED', 'VOIDED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "Chatter" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ChatterStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chatter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rule" (
    "id" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleVersion" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "severity" "Severity",
    "weight" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RuleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "chatterId" TEXT NOT NULL,
    "ruleVersionId" TEXT NOT NULL,
    "ruleTitleSnapshot" TEXT NOT NULL,
    "ruleDefinitionSnapshot" TEXT NOT NULL,
    "severitySnapshot" "Severity",
    "weightSnapshot" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "details" TEXT NOT NULL,
    "evidenceUrl" TEXT,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "resolutionNotes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Chatter_status_idx" ON "Chatter"("status");

-- CreateIndex
CREATE INDEX "Rule_isActive_idx" ON "Rule"("isActive");

-- CreateIndex
CREATE INDEX "RuleVersion_ruleId_idx" ON "RuleVersion"("ruleId");

-- CreateIndex
CREATE UNIQUE INDEX "RuleVersion_ruleId_versionNumber_key" ON "RuleVersion"("ruleId", "versionNumber");

-- CreateIndex
CREATE INDEX "Incident_chatterId_idx" ON "Incident"("chatterId");

-- CreateIndex
CREATE INDEX "Incident_ruleVersionId_idx" ON "Incident"("ruleVersionId");

-- CreateIndex
CREATE INDEX "Incident_status_idx" ON "Incident"("status");

-- CreateIndex
CREATE INDEX "Incident_occurredAt_idx" ON "Incident"("occurredAt");

-- AddForeignKey
ALTER TABLE "RuleVersion" ADD CONSTRAINT "RuleVersion_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_chatterId_fkey" FOREIGN KEY ("chatterId") REFERENCES "Chatter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_ruleVersionId_fkey" FOREIGN KEY ("ruleVersionId") REFERENCES "RuleVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
