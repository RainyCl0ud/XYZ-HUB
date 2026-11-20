ALTER TABLE "ChatUnreadReminder" ADD COLUMN "reviewResolvedAt" TIMESTAMPTZ(3), ADD COLUMN "reviewResolvedByName" TEXT;
ALTER TABLE "ChatAnnouncementDelivery" ADD COLUMN "reviewResolvedAt" TIMESTAMPTZ(3), ADD COLUMN "reviewResolvedByName" TEXT;
