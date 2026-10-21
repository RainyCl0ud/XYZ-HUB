-- Keep existing creator identities, assignments and incident history unchanged.
ALTER TABLE "AgencyModel" ADD COLUMN "creatorUserId" TEXT;

CREATE UNIQUE INDEX "AgencyModel_creatorUserId_key" ON "AgencyModel"("creatorUserId");

ALTER TABLE "AgencyModel" ADD CONSTRAINT "AgencyModel_creatorUserId_fkey"
  FOREIGN KEY ("creatorUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
