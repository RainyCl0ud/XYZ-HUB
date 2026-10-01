-- Add an optional management-facing role description without changing
-- role identity, rank, permissions, or current user assignments.
ALTER TABLE "Role"
ADD COLUMN "description" TEXT;

-- Give existing system roles useful descriptions immediately. Custom roles
-- remain nullable until management supplies a description in Role Settings.
UPDATE "Role"
SET "description" = CASE "systemKey"
  WHEN 'OWNER' THEN 'System owner with protected agency-wide administrative authority.'
  WHEN 'OPS_MANAGER' THEN 'Agency-wide operational management and staff oversight.'
  WHEN 'MANAGER' THEN 'Team-level management within assigned organization and creator scope.'
  WHEN 'QC' THEN 'Quality-control review within assigned data scope.'
  WHEN 'CHATTER' THEN 'Standard chatter operational access.'
  WHEN 'TRIAL_CHATTER' THEN 'Limited chatter access for trial staff.'
  WHEN 'DEV' THEN 'Development and technical administration access.'
  WHEN 'ACCOUNTANT' THEN 'Finance and accounting access.'
  WHEN 'MODEL' THEN 'Creator-facing self-service access.'
  WHEN 'GENERAL_STAFF' THEN 'General internal staff access.'
  ELSE "description"
END
WHERE "description" IS NULL
  AND "systemKey" IS NOT NULL;
