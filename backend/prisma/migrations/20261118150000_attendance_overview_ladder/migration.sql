-- New explicit attendance-overview permissions. Grant only on first creation:
-- existing Role Settings grants are never overwritten or restored.
WITH inserted AS (
  INSERT INTO "Permission" ("id", "key", "name", "description", "pageKey", "categoryKey", "actionKey", "updatedAt")
  VALUES
    (gen_random_uuid()::text, 'clock.overview.agency', 'View Agency Attendance Overview', 'See live attendance across eligible active staff. Requires explicit permission.', 'clock', 'overview', 'overview.agency', now()),
    (gen_random_uuid()::text, 'clock.overview.team', 'View Assigned Team Attendance', 'See lower-ranked staff on shared active creator assignments.', 'clock', 'overview', 'overview.team', now()),
    (gen_random_uuid()::text, 'clock.overview.chatters', 'View Assigned Chatter Attendance', 'See lower-ranked Chatters and Trial Chatters on shared active creator assignments.', 'clock', 'overview', 'overview.chatters', now())
  ON CONFLICT ("key") DO NOTHING
  RETURNING "id", "key"
)
INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT gen_random_uuid()::text, r."id", p."id"
FROM inserted p
JOIN "Role" r ON r."archivedAt" IS NULL
WHERE
  (p."key" = 'clock.overview.agency' AND r."systemKey" IN ('OWNER', 'OPS_MANAGER'))
  OR (p."key" = 'clock.overview.team' AND r."systemKey" = 'MANAGER')
  OR (p."key" = 'clock.overview.chatters' AND r."systemKey" = 'QC')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
