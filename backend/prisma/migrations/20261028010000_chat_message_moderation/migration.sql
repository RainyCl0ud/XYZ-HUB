-- Retain message content; moderation never physically removes a message.
ALTER TABLE "ChatMessage"
 ADD COLUMN "deletedAt" TIMESTAMP(3),
 ADD COLUMN "deletedById" TEXT,
 ADD COLUMN "deletedByName" TEXT,
 ADD COLUMN "deletionReason" TEXT;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_deletion_state" CHECK (
 ("deletedAt" IS NULL AND "deletedById" IS NULL AND "deletedByName" IS NULL AND "deletionReason" IS NULL) OR
 ("deletedAt" IS NOT NULL AND "deletedByName" IS NOT NULL AND "deletionReason" IS NOT NULL AND length(trim("deletionReason")) BETWEEN 1 AND 1000)
);
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_deleted_not_pinned" CHECK ("deletedAt" IS NULL OR "pinnedAt" IS NULL);
CREATE INDEX "ChatMessage_channelId_deletedAt_id_idx" ON "ChatMessage"("channelId", "deletedAt", "id");
CREATE INDEX "ChatMessage_conversationId_deletedAt_id_idx" ON "ChatMessage"("conversationId", "deletedAt", "id");
CREATE FUNCTION "chat_deleted_message_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."deletedAt" IS NOT NULL AND (
  ROW(NEW."text", NEW."version", NEW."authorName", NEW."createdAt", NEW."clientNonce", NEW."replyToId", NEW."channelId", NEW."conversationId", NEW."deletedAt", NEW."deletedByName", NEW."deletionReason", NEW."pinnedAt", NEW."pinnedByName", NEW."pinVersion") IS DISTINCT FROM
  ROW(OLD."text", OLD."version", OLD."authorName", OLD."createdAt", OLD."clientNonce", OLD."replyToId", OLD."channelId", OLD."conversationId", OLD."deletedAt", OLD."deletedByName", OLD."deletionReason", OLD."pinnedAt", OLD."pinnedByName", OLD."pinVersion") OR
  (NEW."deletedById" IS DISTINCT FROM OLD."deletedById" AND NEW."deletedById" IS NOT NULL) OR
  (NEW."authorUserId" IS DISTINCT FROM OLD."authorUserId" AND NEW."authorUserId" IS NOT NULL) OR
  (NEW."pinnedById" IS DISTINCT FROM OLD."pinnedById" AND NEW."pinnedById" IS NOT NULL)
 ) THEN RAISE EXCEPTION 'Deleted message content and moderation history are read-only'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "ChatMessage_deleted_immutable" BEFORE UPDATE ON "ChatMessage" FOR EACH ROW EXECUTE FUNCTION "chat_deleted_message_immutable"();
