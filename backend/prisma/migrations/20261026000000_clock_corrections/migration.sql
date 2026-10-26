-- Additive correction history. Existing attendance timestamps stay unchanged.
ALTER TYPE "ClockBreakEndReason" ADD VALUE 'CORRECTION';
CREATE TYPE "ClockCorrectionKind" AS ENUM ('SHIFT_TIMES', 'MISSING_SHIFT');
CREATE TYPE "ClockCorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TABLE "ClockCorrection" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "requestId" TEXT NOT NULL,
  "userId" TEXT,
  "personName" TEXT NOT NULL,
  "shiftId" TEXT,
  "kind" "ClockCorrectionKind" NOT NULL,
  "status" "ClockCorrectionStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT NOT NULL,
  "basisVersion" TEXT,
  "beforeSnapshot" JSONB,
  "proposedSnapshot" JSONB NOT NULL,
  "submittedAt" TIMESTAMPTZ(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewerId" TEXT,
  "reviewerName" TEXT,
  "reviewNote" TEXT,
  "reviewedAt" TIMESTAMPTZ(0),
  CONSTRAINT "ClockCorrection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ClockCorrection_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ClockCorrection_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "ClockShift"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ClockCorrection_reason_check" CHECK (length(trim("reason")) BETWEEN 1 AND 2000),
  CONSTRAINT "ClockCorrection_review_check" CHECK (
    ("status" = 'PENDING' AND "reviewedAt" IS NULL AND "reviewerName" IS NULL AND "reviewNote" IS NULL) OR
    ("status" <> 'PENDING' AND "reviewedAt" IS NOT NULL AND "reviewerName" IS NOT NULL AND length(trim("reviewNote")) BETWEEN 1 AND 2000)
  ),
  CONSTRAINT "ClockCorrection_no_self_approval" CHECK ("status" <> 'APPROVED' OR "userId" IS NULL OR "reviewerId" IS NULL OR "userId" <> "reviewerId"),
  CONSTRAINT "ClockCorrection_basis_check" CHECK (
    ("kind" = 'SHIFT_TIMES' AND "shiftId" IS NOT NULL AND "basisVersion" IS NOT NULL AND "beforeSnapshot" IS NOT NULL) OR
    ("kind" = 'MISSING_SHIFT' AND "basisVersion" IS NULL AND "beforeSnapshot" IS NULL)
  )
);
CREATE UNIQUE INDEX "ClockCorrection_requestId_key" ON "ClockCorrection"("requestId");
CREATE INDEX "ClockCorrection_userId_submittedAt_id_idx" ON "ClockCorrection"("userId", "submittedAt", "id");
CREATE INDEX "ClockCorrection_status_submittedAt_id_idx" ON "ClockCorrection"("status", "submittedAt", "id");
CREATE INDEX "ClockCorrection_shiftId_idx" ON "ClockCorrection"("shiftId");
CREATE UNIQUE INDEX "ClockCorrection_one_pending_shift" ON "ClockCorrection"("shiftId") WHERE "status" = 'PENDING' AND "shiftId" IS NOT NULL;
