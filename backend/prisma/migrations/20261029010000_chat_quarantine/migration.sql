-- Additive creator-local chat restriction; existing users/messages are untouched.
CREATE TABLE "ChatQuarantine" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "modelId" TEXT NOT NULL,
 "userId" TEXT,
 "personName" TEXT NOT NULL,
 "active" BOOLEAN NOT NULL DEFAULT false,
 "version" INTEGER NOT NULL DEFAULT 0 CHECK ("version" >= 0),
 "reason" TEXT NOT NULL CHECK (length(trim("reason")) BETWEEN 1 AND 1000),
 "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "changedById" TEXT NOT NULL,
 "changedByName" TEXT NOT NULL,
 "lastRequestId" TEXT NOT NULL,
 "lastRequestHash" TEXT NOT NULL,
 CONSTRAINT "ChatQuarantine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
 CONSTRAINT "ChatQuarantine_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "ChatArea"("modelId") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ChatQuarantine_modelId_userId_key" ON "ChatQuarantine"("modelId", "userId");
CREATE UNIQUE INDEX "ChatQuarantine_lastRequestId_key" ON "ChatQuarantine"("lastRequestId");
CREATE INDEX "ChatQuarantine_userId_active_idx" ON "ChatQuarantine"("userId", "active");
ALTER TABLE "ChatMessage" ADD COLUMN "systemEventKey" TEXT;
CREATE UNIQUE INDEX "ChatMessage_systemEventKey_key" ON "ChatMessage"("systemEventKey");
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_notice_state" CHECK ("systemEventKey" IS NULL OR
 ("conversationId" IS NOT NULL AND "channelId" IS NULL AND "authorUserId" IS NULL AND "replyToId" IS NULL AND "deletedAt" IS NULL AND "pinnedAt" IS NULL));
CREATE FUNCTION "chat_notice_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."systemEventKey" IS NOT NULL AND (
  ROW(NEW."text", NEW."version", NEW."authorName", NEW."createdAt", NEW."clientNonce", NEW."replyToId", NEW."channelId", NEW."conversationId", NEW."systemEventKey", NEW."deletedAt", NEW."pinnedAt") IS DISTINCT FROM
  ROW(OLD."text", OLD."version", OLD."authorName", OLD."createdAt", OLD."clientNonce", OLD."replyToId", OLD."channelId", OLD."conversationId", OLD."systemEventKey", OLD."deletedAt", OLD."pinnedAt")
 ) THEN RAISE EXCEPTION 'Chat system notices are read-only'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "ChatMessage_notice_immutable" BEFORE UPDATE ON "ChatMessage" FOR EACH ROW EXECUTE FUNCTION "chat_notice_immutable"();
