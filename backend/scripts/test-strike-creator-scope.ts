import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import cookieParser from "cookie-parser";

// Refuse live databases before importing any application code or loading fixtures.
const database = new URL(process.env.DATABASE_URL ?? "");
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(database.hostname)
  && database.port === "55484" && database.pathname.startsWith("/strike_hotfix_"),
"Use a dedicated strike_hotfix_ database on local port 55484.");
assert.equal(process.env.NODE_ENV, "test");
assert.ok(!Object.keys(process.env).some((key) => key.startsWith("RAILWAY_")), "Refuse Railway environments.");

const { prisma } = await import("../src/lib/prisma.js");
const { getAccessContext } = await import("../src/services/access-control.js");
const { canAccessTeamGroup } = await import("../src/services/team-hierarchy.js");
const { getCurrentStrikeLadder } = await import("../src/services/strike-ladder.js");
const { listStrikes, getStrike, getStrikeBySourceIncident, listStrikeHistoryForUser,
  listEligibleStrikeTargets, issueStrike, voidStrike, StrikeManagementError } = await import("../src/services/strike-management.js");
const { createSession } = await import("../src/services/session.js");
const { SESSION_COOKIE_NAME } = await import("../src/services/session-cookie.js");
const { loadSession } = await import("../src/middleware/session-auth.js");
const { requireAuth } = await import("../src/middleware/access.js");
const { default: strikeRoutes } = await import("../src/routes/strikes.js");

const prefix = `strike-scope-${Date.now()}-${process.pid}`;
const userIds: string[] = [], groupIds: string[] = [], modelIds: string[] = [], roleIds: string[] = [], strikeIds: string[] = [];
let reasonId = "", passed = 0;
const pass = (message: string) => { passed++; console.log(`PASS ${message}`); };
const error = (run: () => Promise<unknown>, code: string) => assert.rejects(run,
  (e: unknown) => e instanceof StrikeManagementError && e.code === code);
const app = express();
app.use(express.json(), cookieParser(), loadSession);
app.use("/api/strikes", requireAuth, strikeRoutes);
const server = app.listen(0, "127.0.0.1");

try {
  await once(server, "listening");
  const originalCounts = { incidents: await prisma.incident.count(), strikes: await prisma.strike.count() };
  const group = async (name: string, parentId?: string) => {
    const row = await prisma.teamGroup.create({ data: { name: `${prefix} ${name}`, parentId } });
    groupIds.push(row.id); return row;
  };
  const agency = await group("agency"), parent = await group("creator", agency.id), qcTeam = await group("Quality Checker", parent.id),
    chatterTeam = await group("Chatter", parent.id), trialTeam = await group("Trial", parent.id),
    childTeam = await group("QC child", qcTeam.id);
  const foreignParent = await group("foreign creator team"), foreignRoleGroup = await group("foreign Chatter", foreignParent.id);
  const creator = await prisma.agencyModel.create({ data: { name: `${prefix} creator A` } });
  const otherCreator = await prisma.agencyModel.create({ data: { name: `${prefix} creator B` } });
  modelIds.push(creator.id, otherCreator.id);
  const systemRoles = new Map((await prisma.role.findMany({ where: { systemKey: { not: null } } })).map((r) => [r.systemKey!, r]));
  const makeRole = async (name: string, rank: number | null, scope: "SELF" | "SELF_AND_TEAM" | "ALL", keys: string[]) => {
    const permissions = await prisma.permission.findMany({ where: { key: { in: keys } } });
    assert.equal(permissions.length, keys.length, "Seeded permission catalog required.");
    const row = await prisma.role.create({ data: { name: `${prefix} ${name}`, rank, dataScope: scope,
      rolePermissions: { create: permissions.map((p) => ({ permissionId: p.id })) } } });
    roleIds.push(row.id); return row;
  };
  const readKeys = ["strikes.access", "strikes.view"];
  const readRole = await makeRole("read-only QC", 4, "SELF_AND_TEAM", readKeys);
  const writeRole = await makeRole("delegated QC", 4, "SELF_AND_TEAM", [...readKeys, "strikes.issue", "strikes.void"]);
  const selfRole = await makeRole("self QC", 4, "SELF", readKeys);
  const noViewRole = await makeRole("module only QC", 4, "SELF_AND_TEAM", ["strikes.access"]);
  const noAccessRole = await makeRole("missing dependency", 4, "SELF_AND_TEAM", ["strikes.view"]);
  const unrankedRole = await makeRole("unranked", null, "SELF_AND_TEAM", readKeys);
  const person = async (name: string, roles: { id: string }[], models: string[], team: string | null = chatterTeam.id,
    status: "ACTIVE" | "DEACTIVATED" | "PENDING_SETUP" = "ACTIVE") => {
    const row = await prisma.user.create({ data: { name: `${prefix} ${name}`, email: `${prefix}-${name}@example.test`,
      status, teamGroupId: team, roleMemberships: { create: roles.map((r) => ({ roleId: r.id })) },
      modelAssignments: { create: models.map((modelId) => ({ modelId })) } } });
    userIds.push(row.id); return row;
  };
  const qc = await person("QC", [readRole], [creator.id], qcTeam.id);
  const writer = await person("writer", [writeRole], [creator.id], qcTeam.id);
  const issuer = await person("issuer", [systemRoles.get("MANAGER")!], [creator.id], parent.id);
  const chatter = await person("chatter", [systemRoles.get("CHATTER")!], [creator.id]);
  const trial = await person("trial", [systemRoles.get("TRIAL_CHATTER")!], [creator.id], trialTeam.id);
  const other = await person("other-creator", [systemRoles.get("CHATTER")!], [otherCreator.id]);
  const shared = await person("shared", [systemRoles.get("CHATTER")!], [creator.id, otherCreator.id]);
  const unassigned = await person("unassigned", [systemRoles.get("CHATTER")!], []);
  const ungrouped = await person("ungrouped", [systemRoles.get("CHATTER")!], [creator.id], null);
  const peer = await person("peer", [readRole], [creator.id]);
  const higher = await person("higher", [systemRoles.get("MANAGER")!], [creator.id]);
  const mixed = await person("mixed", [systemRoles.get("CHATTER")!, systemRoles.get("MANAGER")!], [creator.id]);
  const mixedUnranked = await person("mixed-unranked", [systemRoles.get("CHATTER")!, unrankedRole], [creator.id]);
  const noRoles = await person("no-roles", [], [creator.id]);
  const foreignTeam = await person("foreign-team", [systemRoles.get("CHATTER")!], [creator.id], foreignRoleGroup.id);
  const parentChatter = await person("parent-chatter", [systemRoles.get("CHATTER")!], [creator.id], parent.id);
  const parentTrial = await person("parent-trial", [systemRoles.get("TRIAL_CHATTER")!], [creator.id], parent.id);
  const parentOtherCreator = await person("parent-other-creator", [systemRoles.get("CHATTER")!], [otherCreator.id], parent.id);
  const parentShared = await person("parent-shared", [systemRoles.get("CHATTER")!], [creator.id, otherCreator.id], parent.id);
  const parentHigher = await person("parent-higher", [systemRoles.get("CHATTER")!, systemRoles.get("MANAGER")!], [creator.id], parent.id);
  const parentUnranked = await person("parent-unranked", [systemRoles.get("CHATTER")!, unrankedRole], [creator.id], parent.id);
  const parentUnassigned = await person("parent-unassigned", [systemRoles.get("CHATTER")!], [], parent.id);
  const agencyChatter = await person("grandparent-chatter", [systemRoles.get("CHATTER")!], [creator.id], agency.id);
  const inactive = await person("inactive", [systemRoles.get("CHATTER")!], [creator.id], chatterTeam.id, "DEACTIVATED");
  const descendant = await person("descendant", [systemRoles.get("CHATTER")!], [creator.id], childTeam.id);
  const owner = await person("Owner", [systemRoles.get("OWNER")!], [], parent.id);
  const ops = await person("Ops", [systemRoles.get("OPS_MANAGER")!], [], parent.id);
  const self = await person("self", [selfRole], [creator.id], qcTeam.id);
  const noView = await person("no-view", [noViewRole], [creator.id], qcTeam.id);
  const noAccess = await person("no-access", [noAccessRole], [creator.id], qcTeam.id);
  const unranked = await person("unranked-viewer", [unrankedRole], [creator.id], qcTeam.id);
  const noAssignment = await person("unassigned-viewer", [readRole], [], qcTeam.id);
  const allAssigned = await person("all-assigned", [readRole], [creator.id, otherCreator.id], qcTeam.id);
  const ladder = await getCurrentStrikeLadder();
  const reason = await prisma.strikeReason.create({ data: { name: `${prefix} reason` } }); reasonId = reason.id;
  const record = async (user: typeof chatter, overrides: { expiresAt?: Date; voidedAt?: Date; sourceIncidentId?: string } = {}) => {
    const row = await prisma.strike.create({ data: { userId: user.id, userNameSnapshot: user.name, userEmailSnapshot: user.email,
      issuedByUserId: issuer.id, issuedByNameSnapshot: issuer.name, reasonId, reasonNameSnapshot: reason.name,
      details: "Fictional local regression fixture", expiresAt: new Date(Date.now() + 86400000), ladderVersionId: ladder.id,
      activeStrikeCountAfterIssue: 1, standingLabelSnapshot: "Formal Warning", deductionPercentSnapshot: 0, ...overrides } });
    strikeIds.push(row.id); return row;
  };
  const visible = await record(chatter, { sourceIncidentId: `${prefix}-trace` }), trialRecord = await record(trial);
  const expired = await record(chatter, { expiresAt: new Date(Date.now() - 86400000) });
  const voided = await record(chatter, { voidedAt: new Date() });
  const restricted = await Promise.all([other, shared, unassigned, ungrouped, peer, higher, mixed, mixedUnranked, noRoles, foreignTeam,
    parentOtherCreator, parentShared, parentHigher, parentUnranked, parentUnassigned, agencyChatter, owner].map((u) => record(u)));
  const parentRecord = await record(parentChatter, { sourceIncidentId: `${prefix}-parent-trace` });
  const parentTrialRecord = await record(parentTrial);
  const inactiveRecord = await record(inactive), descendantRecord = await record(descendant), selfRecord = await record(self);
  const scope = await getAccessContext(qc.id);
  assert.equal(await canAccessTeamGroup(scope, chatterTeam.id), false, "Reproduce sibling organization groups.");
  const ids = (await listStrikes(scope)).map((r) => r.id);
  assert.ok(ids.includes(visible.id), "QC must see another issuer's Strike for a current creator teammate in the sibling Chatter group.");
  assert.ok(ids.includes(trialRecord.id));
  assert.ok(ids.includes(expired.id)); assert.ok(ids.includes(voided.id));
  assert.ok(ids.includes(inactiveRecord.id)); assert.ok(ids.includes(descendantRecord.id));
  for (const r of restricted) assert.ok(!ids.includes(r.id), `Restricted fixture leaked: ${r.id}`);
  assert.ok(!(await listStrikes({ ...scope, canSeeAllModels: true, assignedModelIds: [] })).some((r) => r.id === visible.id),
    "Global creator visibility without assignments must not establish a sibling creator team.");
  assert.ok(!(await listStrikes({ ...scope, canSeeAllModels: true })).some((r) => r.userId === other.id),
    "Global creator visibility must not bypass the explicit creator-team membership check.");
  pass("Creator-team Chatter/Trial history includes other issuers, expired and voided records; unsafe targets stay hidden");
  assert.ok(ids.includes(parentRecord.id), "QC in a creator subgroup must read the same creator's lower-ranked Chatter directly in its immediate parent team.");
  assert.ok(ids.includes(parentTrialRecord.id));
  assert.equal((await getStrike(parentRecord.id, scope)).id, parentRecord.id);
  assert.equal((await getStrikeBySourceIncident(`${prefix}-parent-trace`, scope))?.id, parentRecord.id);
  assert.equal((await listStrikeHistoryForUser(parentChatter.id, scope))?.total, 1);
  pass("Parent-team Chatter/Trial records are visible from a QC subgroup without exposing grandparents, other creators or protected roles");
  assert.equal((await getStrike(visible.id, scope)).id, visible.id);
  assert.equal((await getStrikeBySourceIncident(`${prefix}-trace`, scope))?.id, visible.id);
  const history = await listStrikeHistoryForUser(chatter.id, scope);
  assert.equal(history?.total, 3);
  for (const r of restricted) await error(() => getStrike(r.id, scope), "STRIKE_NOT_FOUND");
  assert.equal(await listStrikeHistoryForUser(other.id, scope), null);
  pass("List, direct details, QA trace link and person history use the same visibility boundary");
  const selfScope = await getAccessContext(self.id);
  assert.deepEqual((await listStrikes(selfScope)).filter((r) => strikeIds.includes(r.id)).map((r) => r.id), [selfRecord.id]);
  pass("Self-only scope remains limited to the caller's own history");
  for (const user of [noView, noAccess]) await error(async () => listStrikes(await getAccessContext(user.id)), "STRIKES_VIEW_REQUIRED");
  assert.ok(!(await listStrikes(await getAccessContext(unranked.id))).some((r) => r.id === visible.id));
  assert.ok(!(await listStrikes(await getAccessContext(noAssignment.id))).some((r) => r.id === visible.id));
  assert.ok(!(await listStrikes(await getAccessContext(allAssigned.id))).some((r) => r.userId === shared.id));
  pass("Module/action dependencies, role rank, current assignments and all assigned-creator boundaries remain enforced");
  const deniedInput = { userId: chatter.id, reasonId, details: "Read-only viewer must not issue this." };
  await error(() => issueStrike(deniedInput, scope), "STRIKES_ISSUE_REQUIRED");
  await error(() => voidStrike(visible.id, "Not permitted", scope), "STRIKES_VOID_REQUIRED");
  await error(() => listEligibleStrikeTargets(scope), "STRIKES_ISSUE_REQUIRED");
  const writerScope = await getAccessContext(writer.id);
  await error(() => voidStrike(visible.id, "Outside existing write scope", writerScope), "STRIKE_NOT_MANAGEABLE");
  await error(() => voidStrike(parentRecord.id, "No new parent write authority", writerScope), "STRIKE_NOT_MANAGEABLE");
  const eligible = (await listEligibleStrikeTargets(writerScope)).map((u) => u.id);
  assert.ok(eligible.includes(descendant.id));
  assert.ok(!eligible.includes(chatter.id) && !eligible.includes(trial.id), "Read fix must not broaden existing write scope.");
  assert.ok(!eligible.includes(parentChatter.id) && !eligible.includes(parentTrial.id));
  await error(() => issueStrike({ ...deniedInput, userId: parentChatter.id }, writerScope), "TARGET_NOT_MANAGEABLE");
  for (const u of [other, shared, unassigned, ungrouped, peer, higher, mixed, mixedUnranked, noRoles, owner, inactive, writer]) assert.ok(!eligible.includes(u.id));
  await error(() => issueStrike(deniedInput, writerScope), "TARGET_NOT_MANAGEABLE");
  const issued = await issueStrike({ ...deniedInput, userId: descendant.id, details: "Existing delegated write scope." }, writerScope); strikeIds.push(issued.id);
  assert.equal(issued.issuedByUserId, writer.id);
  assert.ok((await listStrikes(scope)).some((r) => r.id === issued.id));
  const cancelled = await voidStrike(issued.id, "Local regression cleanup", writerScope);
  assert.equal(cancelled.status, "VOIDED");
  await error(() => issueStrike({ ...deniedInput, userId: writer.id }, writerScope), "CANNOT_STRIKE_SELF");
  pass("Issue/void remain separately permissioned and keep their original team scope; no new write authority is granted");
  const cookie = async (userId: string) => {
    const s = await createSession({ userId, expiresAt: new Date(Date.now() + 600000) }); return `${SESSION_COOKIE_NAME}=${s.token}`;
  };
  const qcCookie = await cookie(qc.id), noViewCookie = await cookie(noView.id);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/strikes`;
  const request = (path: string, session?: string, body?: unknown) => fetch(base + path, { method: body ? "POST" : "GET",
    headers: { ...(session ? { cookie: session } : {}), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  assert.equal((await request("/")).status, 401);
  assert.equal((await request("/", noViewCookie)).status, 403);
  const response = await request("/", qcCookie); assert.equal(response.status, 200);
  assert.ok((await response.json()).data.some((r: { id: string }) => r.id === visible.id));
  assert.equal((await request(`/${visible.id}`, qcCookie)).status, 200);
  assert.equal((await request(`/${parentRecord.id}`, qcCookie)).status, 200);
  assert.equal((await request(`/${restricted[0].id}`, qcCookie)).status, 404);
  assert.equal((await request("/eligible-users", qcCookie)).status, 403);
  assert.equal((await request("/", qcCookie, deniedInput)).status, 403);
  pass("Real session-authenticated HTTP permits authorized reads, rejects anonymous/unauthorized writes and hides foreign IDs");
  await prisma.userModelAssignment.deleteMany({ where: { userId: chatter.id } });
  assert.ok(!(await listStrikes(await getAccessContext(qc.id))).some((r) => r.userId === chatter.id));
  await error(async () => getStrike(visible.id, await getAccessContext(qc.id)), "STRIKE_NOT_FOUND");
  await prisma.userModelAssignment.create({ data: { userId: chatter.id, modelId: creator.id } });
  await prisma.userModelAssignment.deleteMany({ where: { userId: parentChatter.id } });
  assert.equal((await request(`/${parentRecord.id}`, qcCookie)).status, 404);
  await prisma.userModelAssignment.create({ data: { userId: parentChatter.id, modelId: creator.id } });
  await prisma.userModelAssignment.deleteMany({ where: { userId: qc.id } });
  assert.ok(!(await listStrikes(await getAccessContext(qc.id))).some((r) => r.id === visible.id));
  assert.equal((await request(`/${visible.id}`, qcCookie)).status, 404, "Existing sessions must use fresh assignments.");
  await prisma.userModelAssignment.create({ data: { userId: qc.id, modelId: creator.id } });
  pass("Target transfer and reviewer unassignment immediately revoke old visibility, including an existing session");
  await prisma.rolePermission.deleteMany({ where: { roleId: readRole.id, permission: { key: "strikes.view" } } });
  assert.equal((await request("/", qcCookie)).status, 403);
  pass("Removing View Strikes immediately revokes access without changing team assignments");
  const deleted = await person("deleted", [systemRoles.get("CHATTER")!], [creator.id]);
  const deletedRecord = await record(deleted);
  await prisma.user.delete({ where: { id: deleted.id } });
  assert.ok(!(await listStrikes(writerScope)).some((r) => r.id === deletedRecord.id));
  const ownerScope = await getAccessContext(owner.id), opsScope = await getAccessContext(ops.id);
  assert.equal((await getStrike(deletedRecord.id, ownerScope)).id, deletedRecord.id);
  assert.equal((await getStrike(deletedRecord.id, opsScope)).id, deletedRecord.id);
  await error(() => getStrike(restricted[restricted.length - 1].id, ownerScope), "STRIKE_NOT_FOUND");
  assert.equal(await canAccessTeamGroup(scope, chatterTeam.id), false, "Shared organization access rules must remain unchanged.");
  assert.equal(await prisma.incident.count(), originalCounts.incidents);
  assert.equal(await prisma.strike.count({ where: { id: { notIn: strikeIds } } }), originalCounts.strikes);
  pass("Owner/Ops deleted history and protected Owner targets are preserved; shared team rules and existing records stay untouched");
  console.log(`Strike creator-scope regression suite passed (${passed} groups). Local fixtures only.`);
} finally {
  await new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve()));
  await prisma.strike.deleteMany({ where: { id: { in: strikeIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  if (reasonId) await prisma.strikeReason.delete({ where: { id: reasonId } });
  await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
  await prisma.agencyModel.deleteMany({ where: { id: { in: modelIds } } });
  for (const id of [...groupIds].reverse()) await prisma.teamGroup.delete({ where: { id } });
  await prisma.$disconnect();
}
