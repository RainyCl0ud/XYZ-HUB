-- Preserve retired custom roles and their historical relationships.
ALTER TABLE "Role"
ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "Role_archivedAt_idx"
ON "Role"("archivedAt");
