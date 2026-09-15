-- Add the expiry column as nullable first
ALTER TABLE "Incident"
ADD COLUMN "expiresAt" TIMESTAMP(3);

-- Backfill all existing incidents.
-- Each strike expires exactly 30 days after it was issued.
UPDATE "Incident"
SET "expiresAt" = "occurredAt" + INTERVAL '30 days'
WHERE "expiresAt" IS NULL;

-- New and existing incidents must always have an expiry date
ALTER TABLE "Incident"
ALTER COLUMN "expiresAt" SET NOT NULL;

-- Index for active/expired strike lookups
CREATE INDEX "Incident_expiresAt_idx"
ON "Incident"("expiresAt");