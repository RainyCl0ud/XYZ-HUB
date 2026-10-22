import assert from "node:assert/strict";
import { Prisma, UserStatus } from "@prisma/client";
import { resetPrisma, runStagingReset } from "./reset-staging-test-data.js";

// Execute the real reset transaction against a schema-aware in-memory adapter.
// No connection string is loaded and no database/network call is permitted.
type Row = Record<string, unknown>;
const models = new Map(Prisma.dmmf.datamodel.models.map((model) => [model.name[0].toLowerCase() + model.name.slice(1), model]));
const rows = new Map<string, Row[]>();
const writes: string[] = [];
let reads = 0;
let transactions = 0;
let sequence = 0;
const ownerRole = { id: "owner-role", systemKey: "OWNER", name: "Owner" };
const owners = ["dim@xyzofm.xyz", "galario.rainheart16@gmail.com"].map((email, index) => ({
  id: `owner-${index}`, name: `Owner ${index}`, email, passwordHash: `preserved-${index}`,
  status: UserStatus.ACTIVE, _count: { sessions: 2, twoFactorMethods: 1 },
  roleMemberships: [{ roleId: ownerRole.id, role: ownerRole }],
}));
rows.set("user", [...owners, { id: "old-staff", email: "old@example.test" }]);
rows.set("role", [ownerRole]);
rows.set("strike", [{ id: "stale-strike", userId: "old-staff", sourceIncidentId: "old-incident" }]);
rows.set("strikeReason", [{ id: "old-reason" }]);
rows.set("strikeLadderVersion", [{ id: "old-ladder", versionNumber: 7 }]);
rows.set("strikeLadderStep", [{ id: "old-step", ladderVersionId: "old-ladder" }]);
rows.set("incident", [{ id: "old-incident" }]);
rows.set("chatMessage", [{ id: "old-chat-message" }]);
rows.set("chatChannel", [{ id: "old-chat-channel" }]);
rows.set("chatArea", [{ modelId: "old-creator" }]);
rows.set("chatStandingConversation", [{ id: "old-private-chat", modelId: "old-creator" }]);
rows.set("chatSetup", [{ id: "ordinary-creator-chat-v1" }]);

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, filter]) => {
    if (filter && typeof filter === "object") {
      const value = filter as Row;
      if ("in" in value) return (value.in as unknown[]).includes(row[key]);
      if ("notIn" in value) return !(value.notIn as unknown[]).includes(row[key]);
      if ("not" in value) return row[key] !== value.not;
      if ("some" in value) return Array.isArray(row[key]) &&
        (row[key] as Row[]).some((item) => matches(item, value.some as Row));
      // Compound unique selectors in upsert.
      return Object.entries(value).every(([field, expected]) => row[field] === expected);
    }
    return row[key] === filter;
  });
}
function checkFields(model: string, data: Row) {
  const fields = new Set(models.get(model)?.fields.map((field) => field.name));
  for (const key of Object.keys(data)) assert.ok(fields.has(key), `Unknown ${model} field: ${key}`);
}
function create(model: string, data: Row): Row {
  checkFields(model, data);
  const row = { id: `${model}-${++sequence}`, ...data };
  rows.set(model, [...(rows.get(model) ?? []), row]);
  if (model === "strikeLadderVersion" && data.steps) {
    for (const step of (data.steps as { create: Row[] }).create) create("strikeLadderStep", { ...step, ladderVersionId: row.id });
  }
  return row;
}
function delegate(model: string) {
  const records = () => rows.get(model) ?? [];
  return {
    async findMany(args: { where?: Row } = {}) { reads++; return records().filter((row) => matches(row, args.where)); },
    async findUnique(args: { where: Row }) { reads++; return records().find((row) => matches(row, args.where)) ?? null; },
    async count() { reads++; return records().length; },
    async create(args: { data: Row }) { writes.push(`${model}.create`); return create(model, args.data); },
    async createMany(args: { data: Row[] }) { writes.push(`${model}.createMany`); args.data.forEach((data) => create(model, data)); return { count: args.data.length }; },
    async update(args: { where: Row; data: Row }) {
      checkFields(model, args.data); writes.push(`${model}.update`);
      const row = records().find((record) => matches(record, args.where));
      assert.ok(row); return Object.assign(row, args.data);
    },
    async updateMany(args: { where?: Row; data: Row }) {
      checkFields(model, args.data); writes.push(`${model}.updateMany`);
      const selected = records().filter((row) => matches(row, args.where));
      selected.forEach((row) => Object.assign(row, args.data)); return { count: selected.length };
    },
    async upsert(args: { where: Row; create: Row; update: Row }) {
      checkFields(model, args.create); checkFields(model, args.update); writes.push(`${model}.upsert`);
      const row = records().find((record) => matches(record, args.where));
      return row ? Object.assign(row, args.update) : create(model, args.create);
    },
    async deleteMany(args: { where?: Row } = {}) {
      if (model === "chatChannel") assert.equal(rows.get("chatMessage")?.length, 0);
      if (model === "chatArea") assert.equal(rows.get("chatChannel")?.length, 0);
      if (model === "chatStandingConversation") assert.equal(rows.get("chatMessage")?.length, 0);
      if (model === "agencyModel") { assert.equal(rows.get("chatArea")?.length, 0); assert.equal(rows.get("chatStandingConversation")?.length, 0); }
      if (["strikeReason", "strikeLadderStep", "strikeLadderVersion", "user", "incident"].includes(model)) {
        assert.equal(rows.get("strike")?.length, 0, "Clear Strikes before deleting their policy, identities or QA source history.");
      }
      if (model === "strikeLadderVersion") assert.equal(rows.get("strikeLadderStep")?.length, 0);
      writes.push(`${model}.deleteMany`);
      const keep = records().filter((row) => !matches(row, args.where));
      const count = records().length - keep.length; rows.set(model, keep); return { count };
    },
  };
}

const savedMethods: (() => void)[] = [];
for (const model of models.keys()) {
  const target = Reflect.get(resetPrisma, model) as object;
  for (const [key, method] of Object.entries(delegate(model))) {
    const original = Reflect.get(target, key);
    Reflect.set(target, key, method);
    savedMethods.push(() => Reflect.set(target, key, original));
  }
}
const transaction = resetPrisma.$transaction;
Reflect.set(resetPrisma, "$transaction", async (callback: (tx: typeof resetPrisma) => unknown) => {
  transactions++; return callback(resetPrisma);
});
const savedEnvironment = { ...process.env };
const argv = process.argv;

async function main() {
  process.env.DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/never-connect";
  process.env.RAILWAY_ENVIRONMENT_NAME = "Production";
  process.env.STAGING_RESET_CONFIRM = "RESET_XYZ_STAGING";
  process.argv = argv.slice(0, 2);
  await assert.rejects(runStagingReset(), /not "Staging"/);
  assert.equal(reads, 0); assert.equal(writes.length, 0);
  process.env.RAILWAY_ENVIRONMENT_NAME = "Staging";
  delete process.env.STAGING_RESET_CONFIRM;
  await assert.rejects(runStagingReset(), /Refusing destructive reset/);
  assert.equal(reads, 0); assert.equal(writes.length, 0);
  process.argv = [...argv.slice(0, 2), "--validate-only"];
  await runStagingReset();
  assert.equal(reads, 0); assert.equal(writes.length, 0);
  process.argv = [...argv.slice(0, 2), "--dry-run"];
  await runStagingReset();
  assert.equal(writes.length, 0); assert.equal(transactions, 0);
  process.argv = argv.slice(0, 2);
  process.env.STAGING_RESET_CONFIRM = "RESET_XYZ_STAGING";
  await runStagingReset();
  assert.equal(transactions, 1);
  assert.equal(rows.get("strike")?.length, 0);
  assert.equal(rows.get("strikeReason")?.length, 0);
  const ladder = rows.get("strikeLadderVersion") ?? [];
  assert.equal(ladder.length, 1); assert.equal(ladder[0].versionNumber, 1);
  assert.equal(ladder[0].durationDays, 30); assert.equal(ladder[0].isCurrent, true);
  assert.equal(rows.get("strikeLadderStep")?.length, 5);
  const incidents = rows.get("incident") ?? [];
  assert.ok(incidents.length > 0);
  assert.ok(incidents.every((incident) => !("expiresAt" in incident)));
  assert.ok(incidents.some((incident) => incident.status === "OPEN"));
  assert.ok(incidents.some((incident) => incident.status === "RESOLVED"));
  assert.ok(incidents.some((incident) => incident.status === "VOIDED"));
  for (const owner of owners) {
    const preserved = rows.get("user")?.find((user) => user.id === owner.id);
    assert.equal(preserved?.passwordHash, owner.passwordHash);
    assert.deepEqual(preserved?._count, { sessions: 2, twoFactorMethods: 1 });
  }
  console.log("Passed: Production refusal, confirmation guard, no-write validation/dry run, full schema-compatible reset, old Strike cleanup, default ladder and Owner preservation.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  savedMethods.reverse().forEach((restore) => restore());
  Reflect.set(resetPrisma, "$transaction", transaction);
  for (const key of Object.keys(process.env)) if (!(key in savedEnvironment)) delete process.env[key];
  Object.assign(process.env, savedEnvironment); process.argv = argv;
  await resetPrisma.$disconnect();
});
