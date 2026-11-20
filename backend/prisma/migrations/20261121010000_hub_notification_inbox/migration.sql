CREATE TABLE "HubNotificationRead" (
  "userId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL,
  "readAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "HubNotificationRead_pkey" PRIMARY KEY ("userId", "key"),
  CONSTRAINT "HubNotificationRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "HubNotificationState" (
  "userId" TEXT NOT NULL,
  "readAllBefore" TIMESTAMPTZ(3) NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "HubNotificationState_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "HubNotificationState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
