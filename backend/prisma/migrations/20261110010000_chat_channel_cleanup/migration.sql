ALTER TABLE "ChatChannel" ADD COLUMN "cleanedUpAt" TIMESTAMP(3);

ALTER TABLE "ChatChannel" ADD CONSTRAINT "ChatChannel_cleanup_requires_archive"
CHECK ("cleanedUpAt" IS NULL OR ("archivedAt" IS NOT NULL AND "cleanedUpAt" >= "archivedAt"));
