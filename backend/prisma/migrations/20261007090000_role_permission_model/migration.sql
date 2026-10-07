/*
 * XYZ Management Hub
 * Module -> Access -> Actions permission model
 *
 * DATA MIGRATION ONLY.
 *
 * Legacy Permission rows are intentionally retained for rollback
 * compatibility. New application code exposes only the managed
 * permission catalog.
 */


/* ============================================================
 * 1. UPSERT MANAGED PERMISSION CATALOG
 * ============================================================ */

INSERT INTO "Permission"
(
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
    'perm_dashboard_view',
    'dashboard.view',
    'View Dashboard',
    'Access the main management dashboard.',
    'dashboard',
    'access',
    'view',
    NOW(),
    NOW()
  ),

  (
    'perm_people_access',
    'people.access',
    'Access Employee Management',
    'Open Employee Management and view employees within the allowed organization scope.',
    'people',
    'access',
    'access',
    NOW(),
    NOW()
  ),

  (
    'perm_people_profile_view',
    'people.profile.view',
    'View Employee Profiles',
    'Open employee profile pages and review permitted employee information.',
    'people',
    'profiles',
    'view',
    NOW(),
    NOW()
  ),

  (
    'perm_people_create',
    'people.create',
    'Create Employees',
    'Invite new employees within the allowed role, team, and creator scope.',
    'people',
    'employees',
    'create',
    NOW(),
    NOW()
  ),

  (
    'perm_people_assign_roles',
    'people.assign_roles',
    'Assign Roles',
    'Assign permitted roles to employees within the allowed authority scope.',
    'people',
    'roles',
    'assign',
    NOW(),
    NOW()
  ),

  (
    'perm_people_status_manage',
    'people.status.manage',
    'Deactivate or Reactivate Employees',
    'Change employee account status where organization and authority rules allow it.',
    'people',
    'account',
    'manage_status',
    NOW(),
    NOW()
  ),

  (
    'perm_people_delete',
    'people.delete',
    'Delete Employees',
    'Permanently delete an employee account when destructive-action requirements are satisfied.',
    'people',
    'account',
    'delete',
    NOW(),
    NOW()
  ),

  (
    'perm_two_factor_reset',
    'two_factor.reset',
    'Reset Employee 2FA',
    'Reset another employee''s two-factor authentication and revoke their active sessions.',
    'people',
    'security',
    'reset_2fa',
    NOW(),
    NOW()
  ),

  (
    'perm_quality_access',
    'quality.access',
    'Access Quality & Incidents',
    'Access the Quality & Incidents workspace.',
    'quality',
    'access',
    'access',
    NOW(),
    NOW()
  ),

  (
    'perm_quality_incidents_view',
    'quality.incidents.view',
    'View Incidents',
    'View QA incidents within the allowed creator scope.',
    'quality',
    'incidents',
    'view',
    NOW(),
    NOW()
  ),

  (
    'perm_quality_incidents_create',
    'quality.incidents.create',
    'Create Incidents',
    'Log new QA incidents within the allowed creator scope.',
    'quality',
    'incidents',
    'create',
    NOW(),
    NOW()
  ),

  (
    'perm_quality_incidents_resolve',
    'quality.incidents.resolve',
    'Resolve Incidents',
    'Resolve open QA incidents within the allowed creator scope.',
    'quality',
    'incidents',
    'resolve',
    NOW(),
    NOW()
  ),

  (
    'perm_quality_incidents_void',
    'quality.incidents.void',
    'Void Incidents',
    'Void open QA incidents within the allowed creator scope.',
    'quality',
    'incidents',
    'void',
    NOW(),
    NOW()
  ),

  (
    'perm_quality_chatters_view',
    'quality.chatters.view',
    'View QA Profiles',
    'View chatter and QA profile information within the allowed creator scope.',
    'quality',
    'qa',
    'view',
    NOW(),
    NOW()
  ),

  (
    'perm_quality_chatters_manage',
    'quality.chatters.manage',
    'Manage QA Profiles',
    'Manage QA chatter profiles where the current QA workflow supports changes.',
    'quality',
    'qa',
    'manage',
    NOW(),
    NOW()
  ),

  (
    'perm_quality_rules_view',
    'quality.rules.view',
    'View Rules',
    'View QA rule and configuration information.',
    'quality',
    'rules',
    'view',
    NOW(),
    NOW()
  ),

  (
    'perm_quality_rules_manage',
    'quality.rules.manage',
    'Manage Rules',
    'Create, edit, archive, and configure QA rules where supported.',
    'quality',
    'rules',
    'manage',
    NOW(),
    NOW()
  ),

  (
    'perm_strikes_access',
    'strikes.access',
    'Access Strike Management',
    'Access the Strike Management workspace.',
    'strikes',
    'access',
    'access',
    NOW(),
    NOW()
  ),

  (
    'perm_strikes_view',
    'strikes.view',
    'View Strikes',
    'View disciplinary Strike records within the allowed organization scope.',
    'strikes',
    'strikes',
    'view',
    NOW(),
    NOW()
  ),

  (
    'perm_strikes_issue',
    'strikes.issue',
    'Issue Strikes',
    'Issue disciplinary Strikes to eligible employees.',
    'strikes',
    'strikes',
    'issue',
    NOW(),
    NOW()
  ),

  (
    'perm_strikes_void',
    'strikes.void',
    'Void Strikes',
    'Void previously issued disciplinary Strikes when permitted.',
    'strikes',
    'strikes',
    'void',
    NOW(),
    NOW()
  ),

  (
    'perm_strikes_reasons_view',
    'strikes.reasons.view',
    'View Reasons',
    'View the Strike reason catalog.',
    'strikes',
    'reasons',
    'view',
    NOW(),
    NOW()
  ),

  (
    'perm_strikes_reasons_create',
    'strikes.reasons.create',
    'Add Reasons',
    'Add new Strike reasons.',
    'strikes',
    'reasons',
    'create',
    NOW(),
    NOW()
  ),

  (
    'perm_strikes_reasons_edit',
    'strikes.reasons.edit',
    'Edit Reasons',
    'Edit existing Strike reasons.',
    'strikes',
    'reasons',
    'edit',
    NOW(),
    NOW()
  ),

  (
    'perm_strikes_reasons_archive',
    'strikes.reasons.archive',
    'Archive or Reactivate Reasons',
    'Deactivate or reactivate Strike reasons.',
    'strikes',
    'reasons',
    'archive',
    NOW(),
    NOW()
  ),

  (
    'perm_strikes_ladder_view',
    'strikes.ladder.view',
    'View Strike Ladder Configuration',
    'View the current Strike ladder configuration and version history.',
    'strikes',
    'ladder',
    'view',
    NOW(),
    NOW()
  ),

  (
    'perm_strikes_ladder_edit',
    'strikes.ladder.edit',
    'Edit Strike Ladder Configuration',
    'Create a new Strike ladder configuration version.',
    'strikes',
    'ladder',
    'edit',
    NOW(),
    NOW()
  ),

  (
    'perm_models_access',
    'models.access',
    'Access Creators',
    'View the creator catalog.',
    'models',
    'access',
    'access',
    NOW(),
    NOW()
  ),

  (
    'perm_models_create',
    'models.create',
    'Create Creators',
    'Add creators to the agency catalog.',
    'models',
    'creators',
    'create',
    NOW(),
    NOW()
  ),

  (
    'perm_models_edit',
    'models.edit',
    'Edit Creators',
    'Rename creators in the agency catalog.',
    'models',
    'creators',
    'edit',
    NOW(),
    NOW()
  ),

  (
    'perm_models_status_manage',
    'models.status.manage',
    'Activate or Deactivate Creators',
    'Change creator catalog status while preserving existing history.',
    'models',
    'creators',
    'manage_status',
    NOW(),
    NOW()
  ),

  (
    'perm_roles_access',
    'roles.access',
    'Access Role Settings',
    'View the Role Settings workspace.',
    'roles',
    'access',
    'access',
    NOW(),
    NOW()
  ),

  (
    'perm_roles_manage',
    'roles.manage',
    'Manage Roles',
    'Create, edit, delete, and configure role permissions.',
    'roles',
    'roles',
    'manage',
    NOW(),
    NOW()
  ),

  (
    'perm_audit_access',
    'audit.access',
    'View Audit Log',
    'View and search the append-only audit log.',
    'audit',
    'access',
    'view',
    NOW(),
    NOW()
  )

ON CONFLICT ("key")
DO UPDATE SET
  "name" =
    EXCLUDED."name",

  "description" =
    EXCLUDED."description",

  "pageKey" =
    EXCLUDED."pageKey",

  "categoryKey" =
    EXCLUDED."categoryKey",

  "actionKey" =
    EXCLUDED."actionKey",

  "updatedAt" =
    NOW();


/* ============================================================
 * 2. ALL AUTHENTICATED ROLES CURRENTLY RECEIVE DASHBOARD
 * ============================================================ */

INSERT INTO "RolePermission"
(
  "id",
  "roleId",
  "permissionId",
  "createdAt"
)
SELECT
  'rp_' ||
  md5(
    role."id" ||
    ':' ||
    permission."id"
  ),

  role."id",

  permission."id",

  NOW()

FROM
  "Role" role

CROSS JOIN
  "Permission" permission

WHERE
  permission."key" =
    'dashboard.view'

ON CONFLICT
  ("roleId", "permissionId")
DO NOTHING;


/* ============================================================
 * 3. PEOPLE.MANAGE -> EMPLOYEE MODULE ACCESS
 *
 * This preserves current effective people-management access.
 * It deliberately does NOT translate stale people.deactivate
 * into status management because status was Owner-only at the
 * time this migration was designed.
 * ============================================================ */

WITH mapping(
  "oldKey",
  "newKey"
) AS (
  VALUES
    ('people.manage', 'people.access'),
    ('people.manage', 'people.profile.view'),
    ('people.manage', 'people.create'),
    ('people.manage', 'people.assign_roles'),

    ('roles.manage', 'roles.access'),

    ('strikes.view', 'strikes.access'),

    ('strikes.configure', 'strikes.reasons.view'),
    ('strikes.configure', 'strikes.reasons.create'),
    ('strikes.configure', 'strikes.reasons.edit'),
    ('strikes.configure', 'strikes.reasons.archive'),
    ('strikes.configure', 'strikes.ladder.view'),
    ('strikes.configure', 'strikes.ladder.edit')
)

INSERT INTO "RolePermission"
(
  "id",
  "roleId",
  "permissionId",
  "createdAt"
)
SELECT DISTINCT
  'rp_' ||
  md5(
    legacy."roleId" ||
    ':' ||
    targetPermission."id"
  ),

  legacy."roleId",

  targetPermission."id",

  NOW()

FROM
  "RolePermission" legacy

JOIN
  "Permission" legacyPermission
    ON
      legacyPermission."id" =
        legacy."permissionId"

JOIN
  mapping
    ON
      mapping."oldKey" =
        legacyPermission."key"

JOIN
  "Permission" targetPermission
    ON
      targetPermission."key" =
        mapping."newKey"

ON CONFLICT
  ("roleId", "permissionId")
DO NOTHING;


/* ============================================================
 * 4. PRESERVE ACTUAL CURRENT OWNER-ONLY EMPLOYEE STATUS ACCESS
 * ============================================================ */

INSERT INTO "RolePermission"
(
  "id",
  "roleId",
  "permissionId",
  "createdAt"
)
SELECT
  'rp_' ||
  md5(
    role."id" ||
    ':' ||
    permission."id"
  ),

  role."id",

  permission."id",

  NOW()

FROM
  "Role" role

CROSS JOIN
  "Permission" permission

WHERE
  role."systemKey" =
    'OWNER'

  AND
  permission."key" =
    'people.status.manage'

ON CONFLICT
  ("roleId", "permissionId")
DO NOTHING;


/* ============================================================
 * 5. MIGRATE CURRENT QA ROLE BEHAVIOR INTO EXPLICIT PERMISSIONS
 *
 * Current read roles:
 * OWNER / OPS_MANAGER / MANAGER / QC / DEV
 *
 * Current write/config roles:
 * OWNER / OPS_MANAGER / MANAGER / DEV
 * ============================================================ */

INSERT INTO "RolePermission"
(
  "id",
  "roleId",
  "permissionId",
  "createdAt"
)
SELECT
  'rp_' ||
  md5(
    role."id" ||
    ':' ||
    permission."id"
  ),

  role."id",

  permission."id",

  NOW()

FROM
  "Role" role

CROSS JOIN
  "Permission" permission

WHERE
  role."systemKey" IN (
    'OWNER',
    'OPS_MANAGER',
    'MANAGER',
    'QC',
    'DEV'
  )

  AND
  permission."key" IN (
    'quality.access',
    'quality.incidents.view',
    'quality.chatters.view'
  )

ON CONFLICT
  ("roleId", "permissionId")
DO NOTHING;


INSERT INTO "RolePermission"
(
  "id",
  "roleId",
  "permissionId",
  "createdAt"
)
SELECT
  'rp_' ||
  md5(
    role."id" ||
    ':' ||
    permission."id"
  ),

  role."id",

  permission."id",

  NOW()

FROM
  "Role" role

CROSS JOIN
  "Permission" permission

WHERE
  role."systemKey" IN (
    'OWNER',
    'OPS_MANAGER',
    'MANAGER',
    'DEV'
  )

  AND
  permission."key" IN (
    'quality.incidents.create',
    'quality.incidents.resolve',
    'quality.incidents.void',
    'quality.chatters.manage',
    'quality.rules.view',
    'quality.rules.manage'
  )

ON CONFLICT
  ("roleId", "permissionId")
DO NOTHING;


/* ============================================================
 * 6. PRESERVE CURRENT EFFECTIVE CREATOR-CATALOG ACCESS
 *
 * Existing behavior requires:
 * - OWNER or OPS_MANAGER
 * - AND legacy people.manage
 *
 * Staging currently satisfies this only for OWNER.
 * ============================================================ */

INSERT INTO "RolePermission"
(
  "id",
  "roleId",
  "permissionId",
  "createdAt"
)
SELECT
  'rp_' ||
  md5(
    role."id" ||
    ':' ||
    permission."id"
  ),

  role."id",

  permission."id",

  NOW()

FROM
  "Role" role

CROSS JOIN
  "Permission" permission

WHERE
  role."systemKey" IN (
    'OWNER',
    'OPS_MANAGER'
  )

  AND
  permission."key" IN (
    'models.access',
    'models.create',
    'models.edit',
    'models.status.manage'
  )

  AND EXISTS (
    SELECT
      1

    FROM
      "RolePermission" legacy

    JOIN
      "Permission" legacyPermission
        ON
          legacyPermission."id" =
            legacy."permissionId"

    WHERE
      legacy."roleId" =
        role."id"

      AND
      legacyPermission."key" =
        'people.manage'
  )

ON CONFLICT
  ("roleId", "permissionId")
DO NOTHING;


/* ============================================================
 * 7. PRESERVE ACTUAL CURRENT AUDIT ACCESS
 *
 * Dev has a stale audit.view row in Staging but current
 * authorization explicitly removes Audit from non-Owners.
 *
 * Therefore audit.access is initialized only for OWNER.
 * ============================================================ */

INSERT INTO "RolePermission"
(
  "id",
  "roleId",
  "permissionId",
  "createdAt"
)
SELECT
  'rp_' ||
  md5(
    role."id" ||
    ':' ||
    permission."id"
  ),

  role."id",

  permission."id",

  NOW()

FROM
  "Role" role

CROSS JOIN
  "Permission" permission

WHERE
  role."systemKey" =
    'OWNER'

  AND
  permission."key" =
    'audit.access'

ON CONFLICT
  ("roleId", "permissionId")
DO NOTHING;
