-- ============================================================
-- PR3: QA / STRIKE ESCALATION FOUNDATION
-- ============================================================
--
-- QA Incidents and disciplinary Strikes are separate domains.
-- QA no longer expires according to the Strike Ladder.
--
-- A Strike may optionally reference the QA Incident that caused
-- management to deliberately issue it.
--
-- No existing QA Incident is converted into a Strike.
-- ============================================================

-- Remove the legacy QA expiry semantics.

DROP INDEX IF EXISTS "Incident_expiresAt_idx";

ALTER TABLE "Incident"
DROP COLUMN "expiresAt";

-- Add optional traceability from Strike -> originating QA Incident.
--
-- No foreign key is intentionally created here. The application
-- validates the reference when management deliberately escalates
-- a QA Incident. This keeps QA and Strike lifecycle ownership
-- independent.
--
-- UNIQUE prevents one QA Incident from accidentally generating
-- multiple directly-linked disciplinary Strikes.

ALTER TABLE "Strike"
ADD COLUMN "sourceIncidentId" TEXT;

CREATE UNIQUE INDEX "Strike_sourceIncidentId_key"
ON "Strike"("sourceIncidentId");

-- Dim's clarified workflow allows QC to decide whether coaching /
-- correction failure should be escalated into a Strike.
--
-- QC gets view + issue only.
-- QC does NOT receive void or configuration authority.

INSERT INTO "RolePermission" (
    "id",
    "roleId",
    "permissionId",
    "createdAt"
)
SELECT
    'rp_qc_strikes_view',
    r."id",
    p."id",
    CURRENT_TIMESTAMP
FROM "Role" r
JOIN "Permission" p
    ON p."key" = 'strikes.view'
WHERE r."systemKey" = 'QC'
ON CONFLICT ("roleId", "permissionId")
DO NOTHING;

INSERT INTO "RolePermission" (
    "id",
    "roleId",
    "permissionId",
    "createdAt"
)
SELECT
    'rp_qc_strikes_issue',
    r."id",
    p."id",
    CURRENT_TIMESTAMP
FROM "Role" r
JOIN "Permission" p
    ON p."key" = 'strikes.issue'
WHERE r."systemKey" = 'QC'
ON CONFLICT ("roleId", "permissionId")
DO NOTHING;