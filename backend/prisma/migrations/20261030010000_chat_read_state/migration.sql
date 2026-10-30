-- Additive only. Existing messages, grants, roles and assignments are retained.
CREATE TABLE "ChatMessageRead" (
  "messageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatMessageRead_pkey" PRIMARY KEY ("messageId", "userId"),
  CONSTRAINT "ChatMessageRead_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChatMessageRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ChatMessageRead_userId_idx" ON "ChatMessageRead"("userId");
-- Avoid turning old history into a backlog or emailing about it later.
INSERT INTO "ChatSetup" ("id", "createdAt") VALUES ('chat-unread-v1', clock_timestamp() AT TIME ZONE 'UTC');
