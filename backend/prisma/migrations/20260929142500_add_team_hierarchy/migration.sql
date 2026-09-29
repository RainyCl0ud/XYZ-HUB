-- CreateTable
CREATE TABLE "TeamGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "isRoot" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamGroup_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "User"
ADD COLUMN "teamGroupId" TEXT;

-- Seed the permanent agency root so existing staging/production users
-- immediately have a valid organization location after deployment.
INSERT INTO "TeamGroup" (
    "id",
    "name",
    "parentId",
    "isRoot",
    "createdAt",
    "updatedAt"
)
VALUES (
    'xyz_management_root',
    'XYZ Management',
    NULL,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

UPDATE "User"
SET "teamGroupId" = 'xyz_management_root'
WHERE "teamGroupId" IS NULL;

-- CreateIndex
CREATE INDEX "User_teamGroupId_idx"
ON "User"("teamGroupId");

-- CreateIndex
CREATE INDEX "TeamGroup_parentId_idx"
ON "TeamGroup"("parentId");

-- CreateIndex
CREATE INDEX "TeamGroup_name_idx"
ON "TeamGroup"("name");

-- CreateIndex
CREATE INDEX "TeamGroup_isRoot_idx"
ON "TeamGroup"("isRoot");

-- AddForeignKey
ALTER TABLE "TeamGroup"
ADD CONSTRAINT "TeamGroup_parentId_fkey"
FOREIGN KEY ("parentId")
REFERENCES "TeamGroup"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User"
ADD CONSTRAINT "User_teamGroupId_fkey"
FOREIGN KEY ("teamGroupId")
REFERENCES "TeamGroup"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
