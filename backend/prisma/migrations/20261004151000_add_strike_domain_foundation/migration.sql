-- ============================================================
-- STRIKE DOMAIN FOUNDATION
-- ============================================================
--
-- QA Incidents remain unchanged by this migration.
-- No existing Incident is converted into a Strike.
-- No Incident → Strike foreign key is created.
-- ============================================================

-- ------------------------------------------------------------
-- Strike reasons
-- ------------------------------------------------------------

CREATE TABLE "StrikeReason" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrikeReason_pkey" PRIMARY KEY ("id")
);

-- ------------------------------------------------------------
-- Issued Strikes
-- ------------------------------------------------------------

CREATE TABLE "Strike" (
    "id" TEXT NOT NULL,

    "userId" TEXT,
    "userNameSnapshot" TEXT NOT NULL,
    "userEmailSnapshot" TEXT NOT NULL,

    "issuedByUserId" TEXT,
    "issuedByNameSnapshot" TEXT NOT NULL,

    "reasonId" TEXT NOT NULL,
    "reasonNameSnapshot" TEXT NOT NULL,
    "reasonDescriptionSnapshot" TEXT,

    "details" TEXT NOT NULL,
    "evidenceUrl" TEXT,

    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    "ladderVersionId" TEXT NOT NULL,

    "activeStrikeCountAfterIssue" INTEGER NOT NULL,
    "standingLabelSnapshot" TEXT NOT NULL,
    "deductionPercentSnapshot" DOUBLE PRECISION NOT NULL,

    "voidedAt" TIMESTAMP(3),
    "voidedByUserId" TEXT,
    "voidedByNameSnapshot" TEXT,
    "voidReason" TEXT,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Strike_pkey" PRIMARY KEY ("id")
);

-- ------------------------------------------------------------
-- Strike indexes
-- ------------------------------------------------------------

CREATE UNIQUE INDEX "StrikeReason_name_key"
ON "StrikeReason"("name");

CREATE INDEX "StrikeReason_isActive_idx"
ON "StrikeReason"("isActive");

CREATE INDEX "StrikeReason_sortOrder_idx"
ON "StrikeReason"("sortOrder");

CREATE INDEX "Strike_userId_idx"
ON "Strike"("userId");

CREATE INDEX "Strike_issuedByUserId_idx"
ON "Strike"("issuedByUserId");

CREATE INDEX "Strike_reasonId_idx"
ON "Strike"("reasonId");

CREATE INDEX "Strike_ladderVersionId_idx"
ON "Strike"("ladderVersionId");

CREATE INDEX "Strike_issuedAt_idx"
ON "Strike"("issuedAt");

CREATE INDEX "Strike_expiresAt_idx"
ON "Strike"("expiresAt");

CREATE INDEX "Strike_voidedAt_idx"
ON "Strike"("voidedAt");

-- ------------------------------------------------------------
-- Strike foreign keys
--
-- Employee/issuer/voider references use SET NULL so historical
-- discipline survives permanent deletion of a user.
-- ------------------------------------------------------------

ALTER TABLE "Strike"
ADD CONSTRAINT "Strike_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "Strike"
ADD CONSTRAINT "Strike_issuedByUserId_fkey"
FOREIGN KEY ("issuedByUserId")
REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "Strike"
ADD CONSTRAINT "Strike_voidedByUserId_fkey"
FOREIGN KEY ("voidedByUserId")
REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "Strike"
ADD CONSTRAINT "Strike_reasonId_fkey"
FOREIGN KEY ("reasonId")
REFERENCES "StrikeReason"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "Strike"
ADD CONSTRAINT "Strike_ladderVersionId_fkey"
FOREIGN KEY ("ladderVersionId")
REFERENCES "StrikeLadderVersion"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

-- ============================================================
-- STRIKE PERMISSION CATALOG
-- ============================================================

INSERT INTO "Permission" (
    "id",
    "key",
    "name",
    "description",
    "pageKey",
    "categoryKey",
    "actionKey",
    "createdAt",
    "updatedAt"
)
VALUES
(
    'perm_strikes_view',
    'strikes.view',
    'View Strikes',
    'View disciplinary Strike records within the user''s allowed organization scope.',
    'strikes',
    'strikes',
    'view',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
(
    'perm_strikes_issue',
    'strikes.issue',
    'Issue Strikes',
    'Issue disciplinary Strikes to eligible employees within the user''s allowed organization and rank scope.',
    'strikes',
    'strikes',
    'issue',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
(
    'perm_strikes_void',
    'strikes.void',
    'Void Strikes',
    'Void previously issued disciplinary Strikes within the user''s allowed organization and rank scope.',
    'strikes',
    'strikes',
    'void',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
(
    'perm_strikes_configure',
    'strikes.configure',
    'Configure Strikes',
    'Manage Strike reasons and Strike policy configuration.',
    'strikes',
    'strikes',
    'configure',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("key")
DO UPDATE SET
    "name" = EXCLUDED."name",
    "description" = EXCLUDED."description",
    "pageKey" = EXCLUDED."pageKey",
    "categoryKey" = EXCLUDED."categoryKey",
    "actionKey" = EXCLUDED."actionKey",
    "updatedAt" = CURRENT_TIMESTAMP;

-- ============================================================
-- INITIAL SYSTEM-ROLE GRANTS
--
-- Existing role customization remains intact except that the
-- new Strike feature receives its initial access policy.
-- ============================================================

-- Owner: view / issue / void / configure

INSERT INTO "RolePermission" (
    "id",
    "roleId",
    "permissionId",
    "createdAt"
)
SELECT
    'rp_owner_strikes_view',
    r."id",
    p."id",
    CURRENT_TIMESTAMP
FROM "Role" r
JOIN "Permission" p
    ON p."key" = 'strikes.view'
WHERE r."systemKey" = 'OWNER'
ON CONFLICT ("roleId", "permissionId")
DO NOTHING;

INSERT INTO "RolePermission" (
    "id",
    "roleId",
    "permissionId",
    "createdAt"
)
SELECT
    'rp_owner_strikes_issue',
    r."id",
    p."id",
    CURRENT_TIMESTAMP
FROM "Role" r
JOIN "Permission" p
    ON p."key" = 'strikes.issue'
WHERE r."systemKey" = 'OWNER'
ON CONFLICT ("roleId", "permissionId")
DO NOTHING;

INSERT INTO "RolePermission" (
    "id",
    "roleId",
    "permissionId",
    "createdAt"
)
SELECT
    'rp_owner_strikes_void',
    r."id",
    p."id",
    CURRENT_TIMESTAMP
FROM "Role" r
JOIN "Permission" p
    ON p."key" = 'strikes.void'
WHERE r."systemKey" = 'OWNER'
ON CONFLICT ("roleId", "permissionId")
DO NOTHING;

INSERT INTO "RolePermission" (
    "id",
    "roleId",
    "permissionId",
    "createdAt"
)
SELECT
    'rp_owner_strikes_configure',
    r."id",
    p."id",
    CURRENT_TIMESTAMP
FROM "Role" r
JOIN "Permission" p
    ON p."key" = 'strikes.configure'
WHERE r."systemKey" = 'OWNER'
ON CONFLICT ("roleId", "permissionId")
DO NOTHING;

-- Ops Manager: view / issue / void / configure

INSERT INTO "RolePermission" (
    "id",
    "roleId",
    "permissionId",
    "createdAt"
)
SELECT
    'rp_ops_strikes_view',
    r."id",
    p."id",
    CURRENT_TIMESTAMP
FROM "Role" r
JOIN "Permission" p
    ON p."key" = 'strikes.view'
WHERE r."systemKey" = 'OPS_MANAGER'
ON CONFLICT ("roleId", "permissionId")
DO NOTHING;

INSERT INTO "RolePermission" (
    "id",
    "roleId",
    "permissionId",
    "createdAt"
)
SELECT
    'rp_ops_strikes_issue',
    r."id",
    p."id",
    CURRENT_TIMESTAMP
FROM "Role" r
JOIN "Permission" p
    ON p."key" = 'strikes.issue'
WHERE r."systemKey" = 'OPS_MANAGER'
ON CONFLICT ("roleId", "permissionId")
DO NOTHING;

INSERT INTO "RolePermission" (
    "id",
    "roleId",
    "permissionId",
    "createdAt"
)
SELECT
    'rp_ops_strikes_void',
    r."id",
    p."id",
    CURRENT_TIMESTAMP
FROM "Role" r
JOIN "Permission" p
    ON p."key" = 'strikes.void'
WHERE r."systemKey" = 'OPS_MANAGER'
ON CONFLICT ("roleId", "permissionId")
DO NOTHING;

INSERT INTO "RolePermission" (
    "id",
    "roleId",
    "permissionId",
    "createdAt"
)
SELECT
    'rp_ops_strikes_configure',
    r."id",
    p."id",
    CURRENT_TIMESTAMP
FROM "Role" r
JOIN "Permission" p
    ON p."key" = 'strikes.configure'
WHERE r."systemKey" = 'OPS_MANAGER'
ON CONFLICT ("roleId", "permissionId")
DO NOTHING;

-- Manager: view / issue

INSERT INTO "RolePermission" (
    "id",
    "roleId",
    "permissionId",
    "createdAt"
)
SELECT
    'rp_manager_strikes_view',
    r."id",
    p."id",
    CURRENT_TIMESTAMP
FROM "Role" r
JOIN "Permission" p
    ON p."key" = 'strikes.view'
WHERE r."systemKey" = 'MANAGER'
ON CONFLICT ("roleId", "permissionId")
DO NOTHING;

INSERT INTO "RolePermission" (
    "id",
    "roleId",
    "permissionId",
    "createdAt"
)
SELECT
    'rp_manager_strikes_issue',
    r."id",
    p."id",
    CURRENT_TIMESTAMP
FROM "Role" r
JOIN "Permission" p
    ON p."key" = 'strikes.issue'
WHERE r."systemKey" = 'MANAGER'
ON CONFLICT ("roleId", "permissionId")
DO NOTHING;