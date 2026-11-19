CREATE TABLE "ChatMessageMention" (
  "messageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "start" INTEGER NOT NULL,
  "end" INTEGER NOT NULL,
  CONSTRAINT "ChatMessageMention_pkey" PRIMARY KEY ("messageId", "start"),
  CONSTRAINT "ChatMessageMention_offsets_check" CHECK ("start" >= 0 AND "end" > "start"),
  CONSTRAINT "ChatMessageMention_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ChatMessageMention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ChatMessageMention_userId_messageId_idx" ON "ChatMessageMention"("userId", "messageId");
