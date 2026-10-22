-- CreateTable
CREATE TABLE "ChatSetup" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatSetup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatArea" (
    "modelId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatArea_pkey" PRIMARY KEY ("modelId")
);

-- CreateTable
CREATE TABLE "ChatChannel" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatRoleGrant" (
    "channelId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT false,
    "canPost" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ChatRoleGrant_pkey" PRIMARY KEY ("channelId","roleId")
);

-- CreateTable
CREATE TABLE "ChatPersonGrant" (
    "channelId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT false,
    "canPost" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ChatPersonGrant_pkey" PRIMARY KEY ("channelId","assignmentId")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "authorName" TEXT NOT NULL,
    "clientNonce" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatChannel_modelId_sortOrder_idx" ON "ChatChannel"("modelId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ChatChannel_modelId_key_key" ON "ChatChannel"("modelId", "key");

-- CreateIndex
CREATE INDEX "ChatRoleGrant_roleId_idx" ON "ChatRoleGrant"("roleId");

-- CreateIndex
CREATE INDEX "ChatPersonGrant_assignmentId_idx" ON "ChatPersonGrant"("assignmentId");

-- CreateIndex
CREATE INDEX "ChatMessage_channelId_createdAt_id_idx" ON "ChatMessage"("channelId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_channelId_authorUserId_clientNonce_key" ON "ChatMessage"("channelId", "authorUserId", "clientNonce");

-- AddForeignKey
ALTER TABLE "ChatArea" ADD CONSTRAINT "ChatArea_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "AgencyModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatChannel" ADD CONSTRAINT "ChatChannel_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ChatArea"("modelId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoleGrant" ADD CONSTRAINT "ChatRoleGrant_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoleGrant" ADD CONSTRAINT "ChatRoleGrant_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatPersonGrant" ADD CONSTRAINT "ChatPersonGrant_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatPersonGrant" ADD CONSTRAINT "ChatPersonGrant_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "UserModelAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
