-- CreateTable
CREATE TABLE "StrikeLadderVersion" (
    "id" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "durationDays" INTEGER NOT NULL DEFAULT 30,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrikeLadderVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrikeLadderStep" (
    "id" TEXT NOT NULL,
    "ladderVersionId" TEXT NOT NULL,
    "minActiveStrikes" INTEGER NOT NULL,
    "standingLabel" TEXT NOT NULL,
    "deductionPercent" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "StrikeLadderStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StrikeLadderVersion_versionNumber_key" ON "StrikeLadderVersion"("versionNumber");

-- CreateIndex
CREATE INDEX "StrikeLadderVersion_isCurrent_idx" ON "StrikeLadderVersion"("isCurrent");

-- CreateIndex
CREATE INDEX "StrikeLadderVersion_createdAt_idx" ON "StrikeLadderVersion"("createdAt");

-- CreateIndex
CREATE INDEX "StrikeLadderStep_ladderVersionId_idx" ON "StrikeLadderStep"("ladderVersionId");

-- CreateIndex
CREATE INDEX "StrikeLadderStep_minActiveStrikes_idx" ON "StrikeLadderStep"("minActiveStrikes");

-- CreateIndex
CREATE UNIQUE INDEX "StrikeLadderStep_ladderVersionId_minActiveStrikes_key" ON "StrikeLadderStep"("ladderVersionId", "minActiveStrikes");

-- AddForeignKey
ALTER TABLE "StrikeLadderStep" ADD CONSTRAINT "StrikeLadderStep_ladderVersionId_fkey" FOREIGN KEY ("ladderVersionId") REFERENCES "StrikeLadderVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
