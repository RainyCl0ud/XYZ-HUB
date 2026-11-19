ALTER TABLE "ChatAnnouncementPost" ADD CONSTRAINT "ChatAnnouncementPost_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
