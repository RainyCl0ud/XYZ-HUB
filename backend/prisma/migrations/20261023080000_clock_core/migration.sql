-- Additive attendance data only. Existing accounts, roles, QA and strikes remain.
CREATE TYPE "ClockBreakKind" AS ENUM ('SHORT_ONE', 'SHORT_TWO', 'MEAL');
CREATE TYPE "ClockBreakEndReason" AS ENUM ('MANUAL', 'LIMIT', 'CLOCK_OUT');
CREATE TABLE "ClockSetup" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "ClockShift" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT,
  "personName" TEXT NOT NULL,
  "startedAt" TIMESTAMPTZ(0) NOT NULL,
  "endedAt" TIMESTAMPTZ(0),
  "startDay" TEXT NOT NULL,
  "startWeek" TEXT NOT NULL,
  "startRequestId" TEXT NOT NULL,
  CONSTRAINT "ClockShift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ClockShift_time_order" CHECK ("endedAt" IS NULL OR "endedAt" >= "startedAt"),
  CONSTRAINT "ClockShift_calendar_format" CHECK ("startDay" ~ '^\d{4}-\d{2}-\d{2}$' AND "startWeek" ~ '^\d{4}-\d{2}-\d{2}$')
);
CREATE UNIQUE INDEX "ClockShift_startRequestId_key" ON "ClockShift"("startRequestId");
CREATE UNIQUE INDEX "ClockShift_one_open_per_user" ON "ClockShift"("userId") WHERE "endedAt" IS NULL AND "userId" IS NOT NULL;
CREATE INDEX "ClockShift_userId_startedAt_idx" ON "ClockShift"("userId", "startedAt");
CREATE INDEX "ClockShift_userId_startWeek_idx" ON "ClockShift"("userId", "startWeek");
CREATE TABLE "ClockBreak" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shiftId" TEXT NOT NULL,
  "kind" "ClockBreakKind" NOT NULL,
  "startedAt" TIMESTAMPTZ(0) NOT NULL,
  "endedAt" TIMESTAMPTZ(0),
  "endReason" "ClockBreakEndReason",
  "startRequestId" TEXT NOT NULL,
  CONSTRAINT "ClockBreak_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "ClockShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ClockBreak_time_order" CHECK ("endedAt" IS NULL OR "endedAt" >= "startedAt"),
  CONSTRAINT "ClockBreak_end_reason" CHECK (("endedAt" IS NULL) = ("endReason" IS NULL))
);
CREATE UNIQUE INDEX "ClockBreak_startRequestId_key" ON "ClockBreak"("startRequestId");
CREATE UNIQUE INDEX "ClockBreak_shiftId_kind_key" ON "ClockBreak"("shiftId", "kind");
CREATE UNIQUE INDEX "ClockBreak_one_open_per_shift" ON "ClockBreak"("shiftId") WHERE "endedAt" IS NULL;
CREATE INDEX "ClockBreak_shiftId_startedAt_idx" ON "ClockBreak"("shiftId", "startedAt");
