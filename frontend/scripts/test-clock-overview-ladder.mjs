import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(resolve(root, path), "utf8");
const [clockPage, ownerPage, tabs, route, backend, permissions] = await Promise.all([
  read("src/pages/ClockPage.tsx"), read("src/pages/OwnerClockPage.tsx"),
  read("src/components/ClockTabs.tsx"), read("../backend/src/routes/clock.ts"),
  read("../backend/src/services/clock-owner-overview.ts"),
  read("../backend/src/permissions/clock-permissions.ts"),
]);
assert.ok(clockPage.includes('const canViewTeam = !!access?.permissions.some('));
assert.ok(clockPage.includes('access?.permissions.includes("clock.access")'));
assert.ok(clockPage.includes('requestedTab === "team" && canViewTeam'));
assert.ok(clockPage.includes('<OwnerClockPage embedded />'));
assert.ok(tabs.includes('canViewTeam && <Link to="/clock?tab=team"'));
assert.ok(ownerPage.includes('embedded ? "overview" : "owner/overview"'));
assert.ok(ownerPage.includes('{!embedded && <ClockTabs mode="owner"'));
assert.ok(ownerPage.includes('data.canReviewSummary &&'));
console.log("PASS 1: Team overview is explicitly permission-gated without replacing personal or Owner clock pages.");

for (const key of ["clock.overview.agency", "clock.overview.team", "clock.overview.chatters"]) {
  assert.ok(backend.includes(key));
}
assert.ok(backend.includes('const highestRank = viewerRanks.length ? Math.min(...viewerRanks) : null;'));
assert.ok(backend.includes('modelAssignments: { some: { modelId: { in: assignedModels }, model: { isActive: true } } }'));
assert.ok(backend.includes('rank: { gt: highestRank! }'));
assert.ok(backend.includes('rank: { lte: highestRank! }'));
assert.ok(backend.includes('effectiveScope === "chatters" ? { systemKey: { in: ["CHATTER", "TRIAL_CHATTER"] } }'));
assert.ok(backend.includes('tx.clockShift.count({ where: openStaffShift })'));
assert.ok(backend.includes('tx.clockBreak.count({'));
assert.ok(backend.includes('where: { AND: [openStaffShift, { id: before }] }'));
assert.ok(route.includes('router.get("/overview"'));
assert.ok(route.includes('router.get("/owner/overview"'));
console.log("PASS 2: Rows, counts, breaks and pagination share the same server-side audience predicate.");

assert.ok(permissions.includes('["overview.agency"'));
assert.ok(permissions.includes('["overview.team"'));
assert.ok(permissions.includes('["overview.chatters"'));
assert.ok(permissions.includes('MANAGER: [...staff, "clock.alerts.team", "clock.corrections.assigned", "clock.overview.team"]'));
assert.ok(permissions.includes('QC: [...staff, "clock.overview.chatters"]'));
assert.ok(permissions.includes('OPS_MANAGER: [...staff, "clock.alerts.all", "clock.corrections.ops", "clock.overview.agency"]'));
console.log("PASS 3: Role Settings scopes are explicit, with distinct default agency, team and QC permissions.");
