-- Additive message interactions; no existing message text or access grants change.
ALTER TABLE "ChatMessage"
 ADD COLUMN "replyToId" TEXT,
 ADD COLUMN "pinnedAt" TIMESTAMP(3),
 ADD COLUMN "pinnedById" TEXT,
 ADD COLUMN "pinnedByName" TEXT,
 ADD COLUMN "pinVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "ChatMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_pinnedById_fkey" FOREIGN KEY ("pinnedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_reply_not_self" CHECK ("replyToId" IS NULL OR "replyToId" <> "id");
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_pin_state" CHECK (("pinnedAt" IS NULL AND "pinnedByName" IS NULL) OR ("pinnedAt" IS NOT NULL AND "pinnedByName" IS NOT NULL));
CREATE INDEX "ChatMessage_replyToId_idx" ON "ChatMessage"("replyToId");
CREATE INDEX "ChatMessage_channelId_pinnedAt_id_idx" ON "ChatMessage"("channelId", "pinnedAt", "id");
CREATE INDEX "ChatMessage_conversationId_pinnedAt_id_idx" ON "ChatMessage"("conversationId", "pinnedAt", "id");
CREATE TABLE "ChatReaction" (
 "messageId" TEXT NOT NULL,
 "userId" TEXT NOT NULL,
 "emoji" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ChatReaction_pkey" PRIMARY KEY ("messageId", "userId", "emoji"),
 CONSTRAINT "ChatReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "ChatReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "ChatReaction_emoji_check" CHECK ("emoji" IN ('👍','❤️','😂','🎉','👀','✅'))
);
CREATE INDEX "ChatReaction_userId_idx" ON "ChatReaction"("userId");
CREATE FUNCTION "chat_reply_same_conversation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."replyToId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "ChatMessage" parent WHERE parent."id" = NEW."replyToId"
   AND parent."channelId" IS NOT DISTINCT FROM NEW."channelId"
   AND parent."conversationId" IS NOT DISTINCT FROM NEW."conversationId"
 ) THEN RAISE EXCEPTION 'A reply must reference a message in the same conversation'; END IF;
 IF TG_OP = 'UPDATE' AND (OLD."replyToId" IS DISTINCT FROM NEW."replyToId" OR OLD."channelId" IS DISTINCT FROM NEW."channelId" OR OLD."conversationId" IS DISTINCT FROM NEW."conversationId") THEN
  RAISE EXCEPTION 'Message conversation and reply target are immutable';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "ChatMessage_reply_scope" BEFORE INSERT OR UPDATE OF "replyToId", "channelId", "conversationId" ON "ChatMessage" FOR EACH ROW EXECUTE FUNCTION "chat_reply_same_conversation"();
