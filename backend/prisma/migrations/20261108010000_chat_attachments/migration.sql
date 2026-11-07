CREATE TABLE "ChatAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    CONSTRAINT "ChatAttachment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ChatAttachment_byteSize_check" CHECK ("byteSize" BETWEEN 1 AND 500000000)
);

CREATE UNIQUE INDEX "ChatAttachment_messageId_key" ON "ChatAttachment"("messageId");
ALTER TABLE "ChatAttachment" ADD CONSTRAINT "ChatAttachment_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
