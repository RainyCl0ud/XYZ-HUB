ALTER TABLE "AuditEvent" ADD COLUMN "protectedAt" TIMESTAMP(3);

CREATE INDEX "AuditEvent_pending_protected_delivery_idx"
  ON "AuditEvent" ("occurredAt", "id")
  WHERE "protectedAt" IS NULL;
