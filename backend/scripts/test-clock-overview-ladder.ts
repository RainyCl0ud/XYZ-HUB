import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma.js";
import { ClockError } from "../src/services/clock-policy.js";
import { getAttendanceOverview, getOwnerClockOverview } from "../src/services/clock-owner-overview.js";
import { centralDayKey, centralWeekKey } from "../src/services/clock-time.js";

async function main() {
  const db = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(db.hostname) && db.pathname.startsWith("/block2_"),
    "Requires an isolated local block2_ test database, never Staging or Production.");
  assert.ok(!Object.keys(process.env).some((k) => k.startsWith("RAILWAY_")), "Tests refuse Railway metadata.");

  const prefix = `overview-${Date.now()}-${process.pid}`;
  const userIds: string[] = [], modelIds: string[] = [];
  let customRoleId: string | null = null;
  let checks = 0;
  const pass = (name: string) => console.log(`PASS ${++checks}: ${name}`);
  const denied = (task: () => Promise<unknown>, status = 403) =>
    assert.rejects(task, (e: unknown) => e instanceof ClockError && e.status === status);

  try {
    const required = ["clock.overview.agency", "clock.overview.team", "clock.overview.chatters"];
    const permissions = await prisma.permission.findMany({ where: { key: { in: [...required, "clock.access"] } } });
    assert.equal(permissions.length, 4, "Apply the attendance-overview migration to the disposable local database first.");
    const permissionIds = new Map(permissions.map((p) => [p.key, p.id]));
    const roles = new Map((await prisma.role.findMany({
      where: { systemKey: { in: ["OWNER", "OPS_MANAGER", "MANAGER", "QC", "CHATTER", "TRIAL_CHATTER", "ACCOUNTANT", "GENERAL_STAFF"] } },
    })).map((r) => [r.systemKey!, r]));
    assert.equal(roles.size, 8, "Seed the isolated local database before running.");
    const create = async (label: string, key: string) => {
      const user = await prisma.user.create({ data: {
        name: `${prefix} ${label}`, email: `${prefix}-${label}@example.test`, status: "ACTIVE",
        roleMemberships: { create: { roleId: roles.get(key)!.id } },
      } }); userIds.push(user.id); return user;
    };
    const owner = await create("owner", "OWNER"), ops = await create("ops", "OPS_MANAGER");
    const manager = await create("manager", "MANAGER"), qc = await create("qc", "QC");
    const chatter = await create("chatter", "CHATTER"), trial = await create("trial", "TRIAL_CHATTER");
    const accountant = await create("accountant", "ACCOUNTANT"), general = await create("general", "GENERAL_STAFF");
    const outside = await create("outside", "CHATTER"), otherManager = await create("other-manager", "MANAGER");
    const offShift = await create("offshift", "CHATTER"), offShiftOutside = await create("offshift-outside", "CHATTER");
    const modelA = await prisma.agencyModel.create({ data: { name: `${prefix} A` } });
    const modelB = await prisma.agencyModel.create({ data: { name: `${prefix} B` } });
    modelIds.push(modelA.id, modelB.id);
    await prisma.userModelAssignment.createMany({ data: [manager, qc, chatter, trial, accountant, general, offShift].map((u) => ({ userId: u.id, modelId: modelA.id })) });
    await prisma.userModelAssignment.createMany({ data: [outside, otherManager, offShiftOutside].map((u) => ({ userId: u.id, modelId: modelB.id })) });
    const now = new Date(Math.floor(Date.now() / 1000) * 1000);
    for (const user of [ops, manager, qc, chatter, trial, accountant, general, outside, otherManager]) {
      await prisma.clockShift.create({ data: { userId: user.id, personName: user.name, startedAt: now,
        startDay: centralDayKey(now), startWeek: centralWeekKey(now), startRequestId: randomUUID() } });
    }
    const names = async (id: string) => new Set((await getAttendanceOverview(id)).activeShifts.map((r) => r.personName));
    const visible = async (id: string) => (await getAttendanceOverview(id)).counts.clockedInStaff;
    await denied(() => getAttendanceOverview(chatter.id));
    await denied(() => getAttendanceOverview(trial.id));
    await denied(() => getOwnerClockOverview(manager.id));
    pass("Staff without explicit attendance-overview grants cannot read a roster or use the Owner endpoint");

    const qcNames = await names(qc.id);
    assert.deepEqual(qcNames, new Set([chatter.name, trial.name]));
    assert.equal(await visible(qc.id), 2);
    assert.deepEqual((await getAttendanceOverview(qc.id)).offShiftStaff.map((x) => x.personName), [offShift.name]);
    assert.equal((await getAttendanceOverview(qc.id)).counts.notClockedInStaff, 1);
    pass("QC sees only assigned Chatters and Trial Chatters; no Managers, QCs, or other creators");

    const managerNames = await names(manager.id);
    assert.deepEqual(managerNames, new Set([qc.name, chatter.name, trial.name]));
    assert.equal(await visible(manager.id), 3);
    assert.equal((await getAttendanceOverview(manager.id)).counts.notClockedInStaff, 1);
    pass("Manager sees lower-ranked assigned QC, Chatter and Trial Chatter without accounting or general-staff leakage");

    const opsNames = await names(ops.id);
    assert.ok(opsNames.has(manager.name) && opsNames.has(accountant.name) && opsNames.has(outside.name) && opsNames.has(ops.name));
    const agency = await getAttendanceOverview(owner.id);
    assert.equal(agency.scope, "agency");
    assert.equal(agency.counts.clockedInStaff, 9);
    assert.equal(await visible(ops.id), 9);
    assert.equal((await getAttendanceOverview(ops.id)).counts.notClockedInStaff, 2);
    assert.equal((await getOwnerClockOverview(owner.id)).counts.clockedInStaff, 9);
    assert.equal((await getAttendanceOverview(owner.id)).counts.notClockedInStaff, 2);
    pass("Owners and explicitly authorized Ops see agency-wide eligible attendance; legacy Owner endpoint stays Owner-only");

    const longShifts = async (id: string) => (await getAttendanceOverview(id)).counts.longShifts;
    assert.equal(await longShifts(owner.id), 0);
    const chatterShift = await prisma.clockShift.findFirstOrThrow({ where: { userId: chatter.id, endedAt: null } });
    const outsideShift = await prisma.clockShift.findFirstOrThrow({ where: { userId: outside.id, endedAt: null } });
    await prisma.clockShift.update({ where: { id: chatterShift.id }, data: { startedAt: new Date(now.getTime() - 15 * 3600_000) } });
    await prisma.clockShift.update({ where: { id: outsideShift.id }, data: { startedAt: new Date(now.getTime() - 13 * 3600_000) } });
    assert.equal(await longShifts(owner.id), 1);
    assert.equal((await getOwnerClockOverview(owner.id)).counts.longShifts, 1);
    assert.equal(await longShifts(manager.id), 1);
    assert.equal(await longShifts(qc.id), 1);
    assert.equal(await longShifts(otherManager.id), 0, "A 13-hour shift is not a long shift");
    await prisma.clockShift.update({ where: { id: outsideShift.id }, data: { startedAt: new Date(now.getTime() - 14 * 3600_000 - 60_000) } });
    assert.equal(await longShifts(otherManager.id), 1);
    assert.equal(await longShifts(manager.id), 1, "Long shifts outside the viewer's creators stay hidden");
    assert.equal(await longShifts(owner.id), 2);
    await prisma.clockShift.updateMany({ where: { id: { in: [chatterShift.id, outsideShift.id] } }, data: { startedAt: now } });
    pass("Long shifts (open 14 hours or more) are counted within each viewer's attendance scope");

    const foreignShift = await prisma.clockShift.findFirstOrThrow({ where: { userId: outside.id, endedAt: null } });
    await denied(() => getAttendanceOverview(qc.id, foreignShift.id), 400);
    await denied(() => getAttendanceOverview(manager.id, foreignShift.id), 400);
    await denied(() => getAttendanceOverview(qc.id, undefined, offShiftOutside.id), 400);
    await denied(() => getAttendanceOverview(manager.id, undefined, offShiftOutside.id), 400);
    pass("Pagination rejects cursors from unassigned or unauthorized creators");

    await prisma.agencyModel.update({ where: { id: modelA.id }, data: { isActive: false } });
    assert.equal(await visible(qc.id), 0);
    assert.equal(await visible(manager.id), 0);
    assert.equal((await getAttendanceOverview(manager.id)).counts.notClockedInStaff, 0);
    assert.equal(await visible(owner.id), 9);
    await prisma.agencyModel.update({ where: { id: modelA.id }, data: { isActive: true } });
    await prisma.userModelAssignment.deleteMany({ where: { userId: qc.id, modelId: modelA.id } });
    assert.equal(await visible(qc.id), 0);
    await prisma.userModelAssignment.create({ data: { userId: qc.id, modelId: modelA.id } });
    assert.equal(await visible(qc.id), 2);
    pass("Creator deactivation and assignment removal immediately revoke scoped rows and counts");

    const custom = await prisma.role.create({ data: { name: `${prefix} coordinator`, isSystem: false, rank: 4, dataScope: "SELF_AND_TEAM" } });
    customRoleId = custom.id;
    await prisma.rolePermission.createMany({ data: ["clock.access", "clock.overview.team"].map((key) => ({ roleId: custom.id, permissionId: permissionIds.get(key)! })) });
    const coordinator = await prisma.user.create({ data: { name: `${prefix} coordinator`,
      email: `${prefix}-coordinator@example.test`, status: "ACTIVE",
      roleMemberships: { create: { roleId: custom.id } } } });
    userIds.push(coordinator.id);
    assert.equal(await visible(coordinator.id), 0);
    await prisma.userModelAssignment.create({ data: { userId: coordinator.id, modelId: modelA.id } });
    assert.deepEqual(await names(coordinator.id), new Set([chatter.name, trial.name]));
    await prisma.rolePermission.deleteMany({ where: { roleId: custom.id, permissionId: permissionIds.get("clock.overview.team")! } });
    await denied(() => getAttendanceOverview(coordinator.id));
    pass("Custom ranked roles receive only explicitly granted attendance scope, and revocation takes effect immediately");

    await prisma.user.update({ where: { id: chatter.id }, data: { status: "DEACTIVATED" } });
    assert.equal(await visible(manager.id), 2);
    await prisma.user.update({ where: { id: offShift.id }, data: { status: "DEACTIVATED" } });
    const remaining = await getAttendanceOverview(manager.id);
    assert.equal(remaining.counts.notClockedInStaff, 1);
    assert.deepEqual(remaining.offShiftStaff.map(person => person.id), [coordinator.id]);
    assert.deepEqual(remaining.offShiftStaff[0].roleNames, [custom.name]);
    pass("Inactive staff are excluded without exposing historic personal attendance");
  } finally {
    await prisma.clockShift.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userModelAssignment.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    if (customRoleId) await prisma.role.delete({ where: { id: customRoleId } });
    await prisma.agencyModel.deleteMany({ where: { id: { in: modelIds } } });
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
