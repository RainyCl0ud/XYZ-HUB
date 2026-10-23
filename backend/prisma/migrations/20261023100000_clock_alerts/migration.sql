-- Additive notification records. Existing shifts and break timestamps remain.
CREATE TYPE "ClockAlertKind" AS ENUM ('BREAK_REMINDER', 'BREAK_LIMIT', 'OPEN_SHIFT');
CREATE TABLE "ClockAlert" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "eventKey" TEXT NOT NULL,
  "shiftId" TEXT NOT NULL,
  "breakId" TEXT,
  "breakKind" "ClockBreakKind",
  "kind" "ClockAlertKind" NOT NULL,
  "occurredAt" TIMESTAMPTZ(0) NOT NULL,
  "recordedAt" TIMESTAMPTZ(0) NOT NULL,
  CONSTRAINT "ClockAlert_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "ClockShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ClockAlert_break_snapshot" CHECK (
    ("kind" = 'OPEN_SHIFT' AND "breakId" IS NULL AND "breakKind" IS NULL) OR
    ("kind" <> 'OPEN_SHIFT' AND "breakId" IS NOT NULL AND "breakKind" IS NOT NULL)
  ),
  CONSTRAINT "ClockAlert_recording_order" CHECK ("recordedAt" >= "occurredAt")
);
CREATE UNIQUE INDEX "ClockAlert_eventKey_key" ON "ClockAlert"("eventKey");
CREATE INDEX "ClockAlert_shiftId_kind_idx" ON "ClockAlert"("shiftId", "kind");
CREATE INDEX "ClockAlert_occurredAt_id_idx" ON "ClockAlert"("occurredAt", "id");
CREATE TABLE "ClockAlertRead" (
  "alertId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "readAt" TIMESTAMPTZ(0) NOT NULL,
  CONSTRAINT "ClockAlertRead_pkey" PRIMARY KEY ("alertId", "userId"),
  CONSTRAINT "ClockAlertRead_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "ClockAlert"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ClockAlertRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ClockAlertRead_userId_idx" ON "ClockAlertRead"("userId");
-- Help the bounded background sweep find open attendance without scanning history.
CREATE INDEX "ClockShift_open_startedAt_idx" ON "ClockShift"("startedAt") WHERE "endedAt" IS NULL;
CREATE INDEX "ClockBreak_open_startedAt_idx" ON "ClockBreak"("startedAt") WHERE "endedAt" IS NULL;
