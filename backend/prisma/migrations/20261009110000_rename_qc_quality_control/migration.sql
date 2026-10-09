-- Rename the QC display label without changing its stable system key or role ID.
-- Preserve existing UserRole and permission relationships.
UPDATE "Role"
SET "name" = 'Quality Control'
WHERE "systemKey" = 'QC'
  AND "name" = 'QC';
