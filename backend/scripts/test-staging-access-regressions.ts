import assert from "node:assert/strict";
import type { Response } from "express";
import { RoleDataScope } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import chatterRoutes from "../src/routes/qa-chatters.js";
import type { AuthenticatedRequest } from "../src/middleware/access.js";
import type { AccessContext } from "../src/services/access-control.js";
import { getPersonQaSummary } from "../src/services/people-qa-summary.js";

// Exercise real route/service code with in-memory records, never a database.
type Row = Record<string, unknown>;
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "AND" || key === "OR") {
      const predicates = (Array.isArray(condition) ? condition : [condition]) as Row[];
      return key === "AND"
        ? predicates.every((predicate) => matches(row, predicate))
        : predicates.some((predicate) => matches(row, predicate));
    }
    const value = row[key];
    if (condition && typeof condition === "object") {
      const filter = condition as Row;
      if ("in" in filter) return (filter.in as unknown[]).includes(value);
      if ("contains" in filter) return typeof value === "string" &&
        value.toLowerCase().includes(String(filter.contains).toLowerCase());
      if ("some" in filter) return Array.isArray(value) &&
        value.some((item) => matches(item as Row, filter.some as Row));
      return Boolean(value && typeof value === "object" && matches(value as Row, filter));
    }
    return value === condition;
  });
}

const restores: (() => void)[] = [];
function replace(target: object, key: string, value: unknown) {
  const original = Reflect.get(target, key);
  Reflect.set(target, key, value);
  restores.push(() => Reflect.set(target, key, original));
}
function access(overrides: Partial<AccessContext> = {}): AccessContext {
  return {
    userId: "reviewer", roles: [], highestRank: 4, teamGroupId: "team-a",
    effectiveDataScope: RoleDataScope.SELF_AND_TEAM,
    permissions: new Set(["quality.access", "quality.chatters.view"]),
    assignedModelIds: ["creator-a"], canSeeAllModels: false, ...overrides,
  };
}

async function main() {
  const records: Row[] = [
    { id: "local", name: "Alex Local", status: "ACTIVE", user: { name: "Alex Local", modelAssignments: [{ modelId: "creator-a" }] }, incidents: [] },
    { id: "remote", name: "Alex Remote", status: "ACTIVE", user: { name: "Alex Remote", modelAssignments: [{ modelId: "creator-b" }] }, incidents: [] },
    { id: "legacy", name: "Alex Legacy", status: "ACTIVE", user: null, incidents: [{ modelId: "creator-a" }] },
    { id: "inactive", name: "Alex Inactive", status: "INACTIVE", user: { name: "Alex Inactive", modelAssignments: [{ modelId: "creator-a" }] }, incidents: [] },
    { id: "renamed", name: "Old name", status: "ACTIVE", user: { name: "Beatrice", modelAssignments: [{ modelId: "creator-a" }] }, incidents: [] },
  ];
  replace(prisma.agencyModel, "findMany", async (args: { where?: Row }) =>
    ["creator-a", "creator-b"].map((id) => ({ id, name: id, isActive: true }))
      .filter((row) => matches(row, args.where)));
  replace(prisma.chatter, "findMany", async (args: { where: Row }) =>
    records.filter((row) => matches(row, args.where)));

  const listRoute = chatterRoutes.stack.map((layer) => layer.route).find((route) =>
    route?.path === "/" && route.stack.some((layer) => Reflect.get(layer, "method") === "get"));
  assert.ok(listRoute, "The active scoped list route must exist.");
  const handler = listRoute.stack[0].handle;
  async function list(viewer: AccessContext | undefined, query: Row, selectedCreator?: string) {
    let status = 200;
    let body: { data?: { id: string }[] } = {};
    const response = {
      status(code: number) { status = code; return this; },
      json(value: typeof body) { body = value; return this; },
    } as unknown as Response;
    await handler({ access: viewer, query, headers: { "x-xyz-model-id": selectedCreator } } as unknown as AuthenticatedRequest, response, () => {});
    return { status, ids: body.data?.map((row) => row.id) ?? [] };
  }

  assert.deepEqual((await list(access(), { search: "Alex", status: "ACTIVE" })).ids, ["local"]);
  assert.deepEqual((await list(access(), { search: "Alex" })).ids, ["local", "inactive"]);
  assert.deepEqual((await list(access(), {})).ids, ["local", "inactive", "renamed"]);
  assert.deepEqual((await list(access({ assignedModelIds: [] }), { search: "Alex" })).ids, []);
  assert.deepEqual((await list(access({ canSeeAllModels: true }), { search: "Alex" })).ids, ["local", "remote", "legacy", "inactive"]);
  assert.deepEqual((await list(access({ canSeeAllModels: true }), { search: "Alex" }, "creator-a")).ids, ["local", "inactive"]);
  assert.deepEqual((await list(access(), { search: "beatrice" })).ids, ["renamed"]);
  assert.equal((await list(access(), {}, "creator-b")).status, 403);
  assert.equal((await list(undefined, { search: "Alex" })).status, 401);
  console.log("Passed: current-assignment searches, unrestricted legacy access, empty assignments, creator selection, status and linked names.");

  records.push(
    { id: "transferred", name: "Alex Transferred", status: "ACTIVE", user: { name: "Alex Transferred", modelAssignments: [{ modelId: "creator-b" }] }, incidents: [{ modelId: "creator-a" }] },
    { id: "unassigned", name: "Alex Unassigned", status: "ACTIVE", user: { name: "Alex Unassigned", modelAssignments: [] }, incidents: [{ modelId: "creator-a" }] },
    { id: "shared", name: "Alex Shared", status: "ACTIVE", user: { name: "Alex Shared", modelAssignments: [{ modelId: "creator-a" }, { modelId: "creator-b" }] }, incidents: [] },
    { id: "other-team", name: "Alex Other Team", status: "ACTIVE", user: { name: "Alex Other Team", teamGroupId: "other-team", modelAssignments: [{ modelId: "creator-a" }] }, incidents: [] },
    { id: "pending", name: "Alex Pending", status: "INACTIVE", user: { name: "Alex Pending", status: "PENDING_SETUP", modelAssignments: [{ modelId: "creator-a" }] }, incidents: [] },
  );
  const currentA = (await list(access(), { search: "Alex" })).ids;
  assert.ok(!currentA.includes("transferred"), "Old QA history must not expose a transferred chatter.");
  assert.ok(!currentA.includes("unassigned"), "Old QA history must not expose an unassigned chatter.");
  assert.ok(currentA.includes("shared"));
  assert.ok(currentA.includes("other-team"), "QA creator membership is independent of organization team.");
  assert.ok(currentA.includes("pending"), "Account setup status must not replace creator assignment checks.");
  assert.ok(!(await list(access(), { search: "Alex", status: "ACTIVE" })).ids.includes("pending"));
  const currentB = (await list(access({ assignedModelIds: ["creator-b"] }), { search: "Alex" })).ids;
  assert.ok(currentB.includes("transferred"));
  assert.ok(currentB.includes("shared"));
  assert.ok(!(await list(access({ canSeeAllModels: true }), { search: "Transferred" }, "creator-a")).ids.includes("transferred"));

  replace(prisma.chatter, "findFirst", async (args: { where: Row }) =>
    records.find((row) => matches(row, args.where)) ?? null);
  const detailRoute = chatterRoutes.stack.map((layer) => layer.route).find((route) => route?.path === "/:id");
  assert.ok(detailRoute);
  async function detail(viewer: AccessContext, id: string, selectedCreator?: string) {
    let status = 200;
    const response = {
      status(code: number) { status = code; return this; },
      json() { return this; },
    } as unknown as Response;
    await detailRoute!.stack[0].handle({ access: viewer, params: { id }, headers: { "x-xyz-model-id": selectedCreator } } as unknown as AuthenticatedRequest, response, () => {});
    return status;
  }
  assert.equal(await detail(access(), "transferred"), 404);
  assert.equal(await detail(access(), "legacy"), 404);
  assert.equal(await detail(access(), "unassigned"), 404);
  assert.equal(await detail(access({ assignedModelIds: ["creator-b"] }), "transferred"), 200);
  assert.equal(await detail(access({ canSeeAllModels: true }), "transferred", "creator-a"), 404);
  assert.equal(await detail(access({ canSeeAllModels: true }), "legacy"), 200);

  const local = records.find((row) => row.id === "local")!;
  local.incidents = [{ modelId: "creator-a" }];
  (local.user as Row).modelAssignments = [{ modelId: "creator-b" }];
  assert.ok(!(await list(access(), { search: "Alex" })).ids.includes("local"));
  assert.equal(await detail(access(), "local"), 404);
  assert.ok((await list(access({ assignedModelIds: ["creator-b"] }), { search: "Alex" })).ids.includes("local"));
  console.log("Passed: transfers remove old-creator roster/detail access immediately; team/setup status and historical QA cannot grant creator membership.");

  replace(prisma.user, "findMany", async () => []);
  replace(prisma.chatter, "findMany", async () => []);
  replace(prisma.chatter, "findUnique", async () => ({ id: "profile", userId: "employee", name: "Employee", status: "ACTIVE" }));
  const incidents = [
    { id: "qa-a", chatterId: "profile", modelId: "creator-a", ruleTitleSnapshot: "Visible QA" },
    { id: "qa-b", chatterId: "profile", modelId: "creator-b", ruleTitleSnapshot: "Other creator QA" },
  ];
  let historyQueries = 0;
  replace(prisma.incident, "findMany", async (args: { where: Row }) => {
    historyQueries++;
    return incidents.filter((row) => matches(row, args.where));
  });
  replace(prisma.incident, "count", async (args: { where: Row }) => {
    historyQueries++;
    return incidents.filter((row) => matches(row, args.where)).length;
  });
  const profilePermissions = ["people.access", "people.profile.view", "quality.access"];
  const denied = await getPersonQaSummary("employee", access({ permissions: new Set(profilePermissions) }));
  assert.equal(denied.canViewQaHistory, false);
  assert.deepEqual(denied.recentIncidents, []);
  assert.equal(denied.totalIncidentCount, 0);
  assert.equal(historyQueries, 0, "Unauthorized summaries must not query incident history.");
  const brokenDependency = await getPersonQaSummary("employee", access({ permissions: new Set(["quality.incidents.view"]) }));
  assert.equal(brokenDependency.canViewQaHistory, false);
  assert.equal(historyQueries, 0);
  const allowed = await getPersonQaSummary("employee", access({ permissions: new Set([...profilePermissions, "quality.incidents.view"]) }));
  assert.equal(allowed.canViewQaHistory, true);
  assert.deepEqual(allowed.recentIncidents.map((row) => row.id), ["qa-a"]);
  assert.equal(allowed.totalIncidentCount, 1);
  const unrestricted = await getPersonQaSummary("employee", access({ permissions: new Set([...profilePermissions, "quality.incidents.view"]), canSeeAllModels: true }));
  assert.equal(unrestricted.totalIncidentCount, 2);
  assert.equal(unrestricted.canViewStrikeHistory, false);
  console.log("Passed: denied/custom/authorized QA summaries, permission dependencies and existing creator boundaries.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  restores.reverse().forEach((restore) => restore());
  await prisma.$disconnect();
});
