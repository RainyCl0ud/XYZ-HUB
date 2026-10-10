-- Preserve existing alphabetical ordering while enabling per-parent custom display order.
ALTER TABLE "TeamGroup" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "parentId" ORDER BY LOWER("name"), "id") - 1 AS position
  FROM "TeamGroup"
)
UPDATE "TeamGroup" AS team SET "sortOrder" = ranked.position
FROM ranked WHERE team."id" = ranked."id";
CREATE INDEX "TeamGroup_parentId_sortOrder_idx" ON "TeamGroup"("parentId", "sortOrder");
