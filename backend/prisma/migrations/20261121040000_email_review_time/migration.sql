ALTER TABLE "ChatUnreadReminder" ADD COLUMN "reviewAt" TIMESTAMPTZ(3);
ALTER TABLE "ChatAnnouncementDelivery" ADD COLUMN "reviewAt" TIMESTAMPTZ(3);
UPDATE "ChatUnreadReminder" SET "reviewAt" = COALESCE("completedAt", "createdAt") WHERE "status" = 'REVIEW';
UPDATE "ChatAnnouncementDelivery" SET "reviewAt" = COALESCE("attemptedAt", "updatedAt") WHERE "status" = 'REVIEW';

CREATE TABLE "EmailLimitWarning" (
  "id" TEXT NOT NULL,
  "startedAt" TIMESTAMPTZ(3) NOT NULL,
  "endedAt" TIMESTAMPTZ(3),
  CONSTRAINT "EmailLimitWarning_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmailLimitWarning_startedAt_idx" ON "EmailLimitWarning"("startedAt");
-- At most one open warning period at a time.
CREATE UNIQUE INDEX "EmailLimitWarning_one_open" ON "EmailLimitWarning" ((1)) WHERE "endedAt" IS NULL;
