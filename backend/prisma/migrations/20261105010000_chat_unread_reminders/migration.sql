-- Additive reminder records. Existing messages, reads and permissions are retained.
CREATE TYPE "ChatUnreadReminderStatus" AS ENUM ('SENDING', 'SENT', 'CAPTURED', 'SKIPPED', 'REVIEW');
CREATE TABLE "ChatUnreadReminderState" (
  "userKey" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT,
  "lastAttemptAt" TIMESTAMPTZ(3),
  "retryAfter" TIMESTAMPTZ(3)
);
CREATE UNIQUE INDEX "ChatUnreadReminderState_userId_key" ON "ChatUnreadReminderState"("userId");
ALTER TABLE "ChatUnreadReminderState" ADD CONSTRAINT "ChatUnreadReminderState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "ChatUnreadReminder" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userKey" TEXT NOT NULL,
  "userId" TEXT,
  "status" "ChatUnreadReminderStatus" NOT NULL,
  "unreadCount" INTEGER NOT NULL CHECK ("unreadCount" > 0),
  "previewEmail" JSONB,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attemptedAt" TIMESTAMPTZ(3),
  "completedAt" TIMESTAMPTZ(3),
  "lastError" TEXT
);
CREATE INDEX "ChatUnreadReminder_userKey_createdAt_idx" ON "ChatUnreadReminder"("userKey", "createdAt");
CREATE INDEX "ChatUnreadReminder_status_createdAt_idx" ON "ChatUnreadReminder"("status", "createdAt");
-- A second safety boundary in addition to the per-person advisory lock.
CREATE UNIQUE INDEX "ChatUnreadReminder_one_sending" ON "ChatUnreadReminder"("userKey") WHERE "status" = 'SENDING';
ALTER TABLE "ChatUnreadReminder" ADD CONSTRAINT "ChatUnreadReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
