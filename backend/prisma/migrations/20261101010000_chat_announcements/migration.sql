-- Additive announcement posts, per-person outbox and sender reservations.
-- CreateEnum
CREATE TYPE "ChatAnnouncementDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'CAPTURED', 'SKIPPED', 'REVIEW');

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "announcementKey" TEXT;

-- CreateTable
CREATE TABLE "ChatAnnouncement" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "authorUserId" TEXT,
    "authorName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatAnnouncement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatAnnouncementPost" (
    "announcementId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL,
    "messageId" TEXT NOT NULL,

    CONSTRAINT "ChatAnnouncementPost_pkey" PRIMARY KEY ("announcementId","targetId")
);

-- CreateTable
CREATE TABLE "ChatAnnouncementDelivery" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "userId" TEXT,
    "userKey" TEXT NOT NULL,
    "personName" TEXT NOT NULL,
    "status" "ChatAnnouncementDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "destinations" JSONB NOT NULL,
    "previewEmail" JSONB,
    "attemptId" TEXT,
    "attemptedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ChatAnnouncementDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailerCapacityReservation" (
    "id" TEXT NOT NULL,
    "senderKey" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailerCapacityReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatAnnouncement_requestId_key" ON "ChatAnnouncement"("requestId");

-- CreateIndex
CREATE INDEX "ChatAnnouncement_createdAt_id_idx" ON "ChatAnnouncement"("createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ChatAnnouncementPost_messageId_key" ON "ChatAnnouncementPost"("messageId");

-- CreateIndex
CREATE INDEX "ChatAnnouncementDelivery_status_updatedAt_idx" ON "ChatAnnouncementDelivery"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatAnnouncementDelivery_announcementId_userKey_key" ON "ChatAnnouncementDelivery"("announcementId", "userKey");

-- CreateIndex
CREATE INDEX "MailerCapacityReservation_senderKey_createdAt_idx" ON "MailerCapacityReservation"("senderKey", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_announcementKey_key" ON "ChatMessage"("announcementKey");

-- AddForeignKey
ALTER TABLE "ChatAnnouncement" ADD CONSTRAINT "ChatAnnouncement_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAnnouncementPost" ADD CONSTRAINT "ChatAnnouncementPost_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "ChatAnnouncement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAnnouncementDelivery" ADD CONSTRAINT "ChatAnnouncementDelivery_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "ChatAnnouncement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatAnnouncementDelivery" ADD CONSTRAINT "ChatAnnouncementDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_announcement_state" CHECK
 ("announcementKey" IS NULL OR ("systemEventKey" IS NULL AND "replyToId" IS NULL AND "deletedAt" IS NULL AND "pinnedAt" IS NULL));
CREATE FUNCTION "chat_announcement_message_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."announcementKey" IS NOT NULL AND (
  ROW(NEW."text", NEW."version", NEW."authorName", NEW."createdAt", NEW."clientNonce", NEW."replyToId", NEW."channelId", NEW."conversationId", NEW."announcementKey", NEW."deletedAt", NEW."pinnedAt") IS DISTINCT FROM
  ROW(OLD."text", OLD."version", OLD."authorName", OLD."createdAt", OLD."clientNonce", OLD."replyToId", OLD."channelId", OLD."conversationId", OLD."announcementKey", OLD."deletedAt", OLD."pinnedAt")
 ) THEN RAISE EXCEPTION 'Published announcements are read-only'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "ChatMessage_announcement_immutable" BEFORE UPDATE ON "ChatMessage" FOR EACH ROW EXECUTE FUNCTION "chat_announcement_message_immutable"();
