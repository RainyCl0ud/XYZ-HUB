CREATE TYPE "ChatStandingKind" AS ENUM ('CREATOR', 'STAFF', 'ACCOUNTANT', 'GENERAL_STAFF');

ALTER TABLE "ChatMessage" ADD COLUMN "conversationId" TEXT,
ALTER COLUMN "channelId" DROP NOT NULL;

CREATE TABLE "ChatStandingConversation" (
    "id" TEXT NOT NULL,
    "kind" "ChatStandingKind" NOT NULL,
    "modelId" TEXT,
    "subjectUserId" TEXT,
    "subjectName" TEXT NOT NULL,
    "assignmentId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatStandingConversation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ChatStandingConversation_shape_check" CHECK (
        ("kind" = 'CREATOR' AND "modelId" IS NOT NULL AND "assignmentId" IS NULL) OR
        ("kind" = 'STAFF' AND "modelId" IS NOT NULL AND "assignmentId" IS NOT NULL) OR
        ("kind" IN ('ACCOUNTANT', 'GENERAL_STAFF') AND "modelId" IS NULL AND "assignmentId" IS NULL)
    )
);

ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_one_target_check"
CHECK (num_nonnulls("channelId", "conversationId") = 1);

CREATE INDEX "ChatStandingConversation_modelId_archivedAt_idx" ON "ChatStandingConversation"("modelId", "archivedAt");
CREATE INDEX "ChatStandingConversation_subjectUserId_kind_archivedAt_idx" ON "ChatStandingConversation"("subjectUserId", "kind", "archivedAt");
CREATE INDEX "ChatMessage_conversationId_createdAt_id_idx" ON "ChatMessage"("conversationId", "createdAt", "id");
CREATE UNIQUE INDEX "ChatMessage_conversationId_authorUserId_clientNonce_key" ON "ChatMessage"("conversationId", "authorUserId", "clientNonce");

-- Only one current conversation per subject/assignment; old episodes survive.
CREATE UNIQUE INDEX "ChatStandingConversation_active_creator_key" ON "ChatStandingConversation"("modelId") WHERE "kind" = 'CREATOR' AND "archivedAt" IS NULL;
CREATE UNIQUE INDEX "ChatStandingConversation_active_staff_key" ON "ChatStandingConversation"("assignmentId") WHERE "kind" = 'STAFF' AND "archivedAt" IS NULL;
CREATE UNIQUE INDEX "ChatStandingConversation_active_personal_key" ON "ChatStandingConversation"("subjectUserId", "kind") WHERE "kind" IN ('ACCOUNTANT', 'GENERAL_STAFF') AND "archivedAt" IS NULL;

ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatStandingConversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChatStandingConversation" ADD CONSTRAINT "ChatStandingConversation_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "AgencyModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChatStandingConversation" ADD CONSTRAINT "ChatStandingConversation_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
