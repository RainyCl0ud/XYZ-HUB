ALTER TABLE "TeamGroup"
ADD COLUMN "color" VARCHAR(7);

COMMENT ON COLUMN "TeamGroup"."color" IS 'Optional #RRGGBB accent chosen for this group. Descendants without their own color inherit it in the UI.';
