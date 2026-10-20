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

  assert.deepEqual((await list(access(), { search: "Alex", status: "ACTIVE" })).ids, ["local", "legacy"]);
  assert.deepEqual((await list(access(), { search: "Alex" })).ids, ["local", "legacy", "inactive"]);
  assert.deepEqual((await list(access(), {})).ids, ["local", "legacy", "inactive", "renamed"]);
  assert.deepEqual((await list(access({ assignedModelIds: [] }), { search: "Alex" })).ids, []);
  assert.deepEqual((await list(access({ canSeeAllModels: true }), { search: "Alex" })).ids, ["local", "remote", "legacy", "inactive"]);
  assert.deepEqual((await list(access({ canSeeAllModels: true }), { search: "Alex" }, "creator-a")).ids, ["local", "legacy", "inactive"]);
  assert.deepEqual((await list(access(), { search: "beatrice" })).ids, ["renamed"]);
  assert.equal((await list(access(), {}, "creator-b")).status, 403);
  assert.equal((await list(undefined, { search: "Alex" })).status, 401);
  console.log("Passed: scoped, unrestricted, legacy, empty-assignment, selected-creator, status and linked-name searches.");

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
