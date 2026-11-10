CREATE TABLE "HubPushSubscription" (
  "id" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "cursorAt" TIMESTAMP(3) NOT NULL,
  "cursorMessageId" TEXT,
  "clockCursorAt" TIMESTAMP(3) NOT NULL,
  "nextCheckAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HubPushSubscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HubPushSubscription_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "HubPushSubscription_endpoint_key" ON "HubPushSubscription"("endpoint");
CREATE INDEX "HubPushSubscription_sessionId_idx" ON "HubPushSubscription"("sessionId");
CREATE INDEX "HubPushSubscription_nextCheckAt_id_idx" ON "HubPushSubscription"("nextCheckAt", "id");
