import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import cookieParser from "cookie-parser";
import { prisma } from "../src/lib/prisma.js";
import { clockIn, clockOut, getOwnClock, installClockDefaults, startBreak } from "../src/services/clock.js";
import { installClockAlertDefaults, listClockAlerts, markClockAlertRead, reconcileClockShift } from "../src/services/clock-alerts.js";
import { ClockError, clockDatabaseNow } from "../src/services/clock-policy.js";
import { clockWorkerTargetAllowed, runClockSweep } from "../src/services/clock-worker.js";
import { centralDayKey, centralWeekKey } from "../src/services/clock-time.js";
import { createSession } from "../src/services/session.js";
import { loadSession } from "../src/middleware/session-auth.js";
import clockRoutes from "../src/routes/clock.js";
import { CHAT_STAGING_ENVIRONMENT_ID, CHAT_STAGING_PROJECT_ID } from "../src/services/chat-staging-target.js";

async function main() {
  const db = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(db.hostname) && db.pathname.startsWith("/block2_"), "Use an isolated named local test database.");
  assert.ok(!Object.keys(process.env).some((key) => key.startsWith("RAILWAY_")), "Local alert tests must not inherit Railway metadata.");
  process.env.BLOCK2_CLOCK_ENABLED = "true";
  const prefix = `clock-alert-test-${Date.now()}-${process.pid}`;
  const users: string[] = [], models: string[] = [], customRoles: string[] = [];
  let passed = 0;
  const check = (name: string) => { passed++; console.log(`✓ ${name}`); };
  const expect = (fn: () => Promise<unknown>, status: number) => assert.rejects(fn, (e: unknown) => e instanceof ClockError && e.status === status);
  const app = express(); app.use(express.json(), cookieParser(), loadSession); app.use("/api/clock", clockRoutes);
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    await prisma.$transaction((tx) => installClockDefaults(tx));
    await prisma.$transaction((tx) => installClockAlertDefaults(tx));
    assert.equal(await prisma.$transaction((tx) => installClockAlertDefaults(tx)), false);
    const roles = new Map((await prisma.role.findMany({ where: { systemKey: { not: null } } })).map((r) => [r.systemKey!, r]));
    const makeUser = async (label: string, keys: string[]) => {
      const user = await prisma.user.create({ data: { name: `${prefix} ${label}`, email: `${prefix}-${label}@example.test`, status: "ACTIVE", roleMemberships: { create: keys.map((key) => ({ roleId: roles.get(key)!.id })) } } });
      users.push(user.id); return user;
    };
    const staff = await makeUser("chatter", ["CHATTER"]), second = await makeUser("second", ["QC"]);
    const manager = await makeUser("manager", ["MANAGER"]), otherManager = await makeUser("other-manager", ["MANAGER"]);
    const ops = await makeUser("ops", ["OPS_MANAGER"]), owner = await makeUser("owner", ["OWNER"]), dev = await makeUser("developer", ["DEV"]);
    const general = await makeUser("general", ["GENERAL_STAFF"]), accountant = await makeUser("accountant", ["ACCOUNTANT"]);
    const modelA = await prisma.agencyModel.create({ data: { name: `${prefix} A` } }), modelB = await prisma.agencyModel.create({ data: { name: `${prefix} B` } }); models.push(modelA.id, modelB.id);
    await prisma.userModelAssignment.createMany({ data: [staff.id, manager.id, general.id, accountant.id].map((userId) => ({ userId, modelId: modelA.id })) });
    await prisma.userModelAssignment.createMany({ data: [staff.id, otherManager.id].map((userId) => ({ userId, modelId: modelB.id })) });
    check("Alert defaults install once; staff remain person-based across several creators");
    const state = await clockIn(staff.id, { requestId: randomUUID() }); const shiftId = state.currentShift!.id;
    const oldStart = new Date(Date.now() - 4 * 3600_000);
    await prisma.clockShift.update({ where: { id: shiftId }, data: { startedAt: oldStart, startDay: centralDayKey(oldStart), startWeek: centralWeekKey(oldStart) } });
    const pause = (await startBreak(staff.id, shiftId, { kind: "SHORT_ONE", requestId: randomUUID() })).currentShift!.breaks[0];
    // Exact boundary checks use the same reconciliation function under the same
    // person lock. No test-only time input is exposed over HTTP.
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${staff.id} FOR UPDATE`;
      const now = await clockDatabaseNow(tx);
      const began = new Date(now.getTime() - 1199_000);
      await tx.clockBreak.update({ where: { id: pause.id }, data: { startedAt: began } });
      const shift = await tx.clockShift.findUniqueOrThrow({ where: { id: shiftId }, include: { breaks: true } });
      await reconcileClockShift(tx, shift, now);
      assert.equal(await tx.clockAlert.count({ where: { shiftId } }), 0);
      await reconcileClockShift(tx, shift, new Date(now.getTime() + 1000));
      assert.equal(await tx.clockAlert.count({ where: { shiftId, kind: "BREAK_REMINDER" } }), 1);
    });
    const first = await listClockAlerts(staff.id);
    const reminder = first.alerts.find((a) => a.kind === "BREAK_REMINDER")!; assert.ok(reminder.own); assert.equal(reminder.status, "Still open");
    assert.equal((await listClockAlerts(manager.id)).alerts.filter((a) => a.id === reminder.id).length, 0);
    assert.equal((await listClockAlerts(owner.id)).alerts.filter((a) => a.id === reminder.id).length, 0);
    await runClockSweep(); await runClockSweep();
    assert.equal(await prisma.auditEvent.count({ where: { targetId: shiftId, action: "clock.break.reminder" } }), 1);
    check("Short reminder begins exactly at 20 minutes, stays private and is recorded/audited once");
    await prisma.clockBreak.update({ where: { id: pause.id }, data: { startedAt: new Date(Date.now() - 1805_000) } });
    await Promise.all([runClockSweep(), runClockSweep(), getOwnClock(staff.id)]);
    const ended = await prisma.clockBreak.findUniqueOrThrow({ where: { id: pause.id } });
    assert.equal(ended.endReason, "LIMIT"); assert.equal(ended.endedAt!.getTime() - ended.startedAt.getTime(), 1800_000);
    assert.equal(await prisma.auditEvent.count({ where: { targetId: shiftId, action: "clock.break.auto_end" } }), 1);
    const flag = (await listClockAlerts(manager.id)).alerts.find((a) => a.kind === "BREAK_LIMIT" && a.personName === staff.name)!; assert.ok(flag);
    assert.ok((await listClockAlerts(otherManager.id)).alerts.some((a) => a.id === flag.id));
    assert.ok((await listClockAlerts(ops.id)).alerts.some((a) => a.id === flag.id));
    assert.ok((await listClockAlerts(owner.id)).alerts.some((a) => a.id === flag.id));
    assert.equal((await listClockAlerts(second.id)).alerts.length, 0);
    assert.equal((await listClockAlerts(dev.id)).alerts.length, 0);
    check("Concurrent worker/refresh checks end one break exactly once and flag both current Managers plus Ops/Owner oversight");
    await Promise.all([markClockAlertRead(manager.id, flag.id), markClockAlertRead(manager.id, flag.id)]);
    assert.equal((await listClockAlerts(manager.id)).alerts.some((a) => a.id === flag.id), false);
    assert.ok((await listClockAlerts(manager.id, "all")).alerts.some((a) => a.id === flag.id && a.readAt));
    assert.ok((await listClockAlerts(otherManager.id)).alerts.some((a) => a.id === flag.id));
    await expect(() => markClockAlertRead(second.id, flag.id), 404);
    await expect(() => markClockAlertRead(manager.id, reminder.id), 404);
    check("Mark-read is private, idempotent, retained in history and cannot acknowledge another person's inaccessible alert");
    await prisma.userModelAssignment.deleteMany({ where: { userId: manager.id } });
    assert.equal((await listClockAlerts(manager.id, "all")).alerts.some((a) => a.id === flag.id), false);
    await expect(() => markClockAlertRead(manager.id, flag.id), 404);
    await expect(() => listClockAlerts(manager.id, "all", flag.id), 400);
    await prisma.agencyModel.update({ where: { id: modelB.id }, data: { isActive: false } });
    assert.equal((await listClockAlerts(otherManager.id, "all")).alerts.some((a) => a.id === flag.id), false);
    assert.ok((await listClockAlerts(staff.id)).alerts.some((a) => a.id === flag.id));
    assert.ok((await getOwnClock(staff.id)).currentShift);
    await prisma.agencyModel.update({ where: { id: modelB.id }, data: { isActive: true } });
    await prisma.userModelAssignment.create({ data: { userId: manager.id, modelId: modelA.id } });
    check("Assignment removal and creator closure revoke manager history immediately without interrupting staff hours");
    const privateStaff = [general, accountant];
    for (const person of privateStaff) {
      const shift = (await clockIn(person.id, { requestId: randomUUID() })).currentShift!;
      await prisma.clockShift.update({ where: { id: shift.id }, data: { startedAt: new Date(Date.now() - 14 * 3600_000 - 1000) } });
    }
    await runClockSweep();
    for (const person of privateStaff) {
      const own = (await listClockAlerts(person.id)).alerts.find((a) => a.kind === "OPEN_SHIFT")!; assert.ok(own);
      assert.ok((await listClockAlerts(ops.id)).alerts.some((a) => a.id === own.id));
      assert.equal((await listClockAlerts(manager.id)).alerts.some((a) => a.id === own.id), false);
      assert.ok((await getOwnClock(person.id)).currentShift, "A 14-hour flag must not automatically clock anyone out");
    }
    check("Accountant/General Staff long shifts go to the person and Ops/Owner; ordinary Managers never receive them");
    const unassignedShift = (await clockIn(second.id, { requestId: randomUUID() })).currentShift!;
    await prisma.clockShift.update({ where: { id: unassignedShift.id }, data: { startedAt: new Date(Date.now() - 14 * 3600_000 - 5000) } });
    await runClockSweep();
    assert.ok((await listClockAlerts(ops.id)).alerts.some((a) => a.personName === second.name));
    assert.equal((await listClockAlerts(manager.id)).alerts.some((a) => a.personName === second.name), false);
    check("Unassigned staff are flagged to agency oversight without requiring a creator");
    const meal = (await startBreak(staff.id, shiftId, { kind: "MEAL", requestId: randomUUID() })).currentShift!.breaks.find((b) => b.kind === "MEAL")!;
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${staff.id} FOR UPDATE`;
      const now = await clockDatabaseNow(tx), began = new Date(now.getTime() - 2099_000);
      await tx.clockBreak.update({ where: { id: meal.id }, data: { startedAt: began } });
      const shift = await tx.clockShift.findUniqueOrThrow({ where: { id: shiftId }, include: { breaks: true } });
      await reconcileClockShift(tx, shift, now); assert.equal(await tx.clockAlert.count({ where: { breakId: meal.id } }), 0);
      await reconcileClockShift(tx, shift, new Date(now.getTime() + 1000)); assert.equal(await tx.clockAlert.count({ where: { breakId: meal.id, kind: "BREAK_REMINDER" } }), 1);
    });
    await prisma.clockBreak.update({ where: { id: meal.id }, data: { startedAt: new Date(Date.now() - 3605_000) } });
    await runClockSweep();
    const endedMeal = await prisma.clockBreak.findUniqueOrThrow({ where: { id: meal.id } });
    assert.equal(endedMeal.endedAt!.getTime() - endedMeal.startedAt.getTime(), 3600_000);
    check("Meal reminder begins exactly at 35 minutes and auto-end preserves the paid 60-minute limit");
    const secondBreak = (await startBreak(staff.id, shiftId, { kind: "SHORT_TWO", requestId: randomUUID() })).currentShift!.breaks.find((b) => b.kind === "SHORT_TWO")!;
    await prisma.clockBreak.update({ where: { id: secondBreak.id }, data: { startedAt: new Date(Date.now() - 1900_000) } });
    await runClockSweep();
    assert.equal(await prisma.clockAlert.count({ where: { breakId: secondBreak.id, kind: "BREAK_REMINDER" } }), 0);
    assert.equal(await prisma.clockAlert.count({ where: { breakId: secondBreak.id, kind: "BREAK_LIMIT" } }), 1);
    await clockOut(staff.id, shiftId);
    assert.ok((await listClockAlerts(staff.id, "all")).alerts.some((a) => a.id === reminder.id && a.status === "Ended"));
    check("Restart-style catch-up skips obsolete reminders and shows ended status after the shift/break finishes");
    const protectedEnv = { BLOCK2_CLOCK_ENABLED: "true", DATABASE_URL: db.href, RAILWAY_PROJECT_ID: CHAT_STAGING_PROJECT_ID, RAILWAY_ENVIRONMENT_ID: CHAT_STAGING_ENVIRONMENT_ID };
    assert.equal(clockWorkerTargetAllowed(protectedEnv), true);
    assert.equal(clockWorkerTargetAllowed({ ...protectedEnv, RAILWAY_ENVIRONMENT_NAME: "Production" }), false);
    assert.equal(clockWorkerTargetAllowed({ ...protectedEnv, RAILWAY_ENVIRONMENT_ID: "2b6bb1b6-a75a-45b1-98cf-f98e79a965a4" }), false);
    assert.equal(clockWorkerTargetAllowed({ ...protectedEnv, RAILWAY_PROJECT_ID: "other" }), false);
    assert.equal(clockWorkerTargetAllowed({ BLOCK2_CLOCK_ENABLED: "false", DATABASE_URL: db.href }), false);
    assert.equal(clockWorkerTargetAllowed({ BLOCK2_CLOCK_ENABLED: "true", DATABASE_URL: "postgresql://example.com/remote" }), false);
    check("Background checks refuse Production, unknown environments and disabled features");
    const bare = await prisma.role.create({ data: { name: `${prefix} custom`, dataScope: "ALL", rolePermissions: { create: { permission: { connect: { key: "clock.alerts.all" } } } } } }); customRoles.push(bare.id);
    const custom = await makeUser("custom", []); await prisma.userRole.create({ data: { userId: custom.id, roleId: bare.id } });
    await expect(() => listClockAlerts(custom.id), 403);
    await prisma.rolePermission.create({ data: { roleId: bare.id, permissionId: (await prisma.permission.findUniqueOrThrow({ where: { key: "clock.access" } })).id } });
    assert.ok((await listClockAlerts(custom.id)).alerts.some((a) => a.id === flag.id));
    await prisma.role.update({ where: { id: bare.id }, data: { archivedAt: new Date() } });
    await expect(() => listClockAlerts(custom.id), 403);
    check("Custom roles need explicit alert permissions plus dependencies; archived roles immediately lose access");
    const rollbackPause = (await startBreak(second.id, unassignedShift.id, { kind: "SHORT_ONE", requestId: randomUUID() })).currentShift!.breaks[0];
    await prisma.clockBreak.update({ where: { id: rollbackPause.id }, data: { startedAt: new Date(Date.now() - 1900_000) } });
    await assert.rejects(prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${second.id} FOR UPDATE`;
      const shift = await tx.clockShift.findUniqueOrThrow({ where: { id: unassignedShift.id }, include: { breaks: true } });
      await reconcileClockShift(tx, shift, await clockDatabaseNow(tx));
      throw new Error("Simulated transaction failure");
    }), /Simulated transaction failure/);
    assert.equal((await prisma.clockBreak.findUniqueOrThrow({ where: { id: rollbackPause.id } })).endedAt, null);
    assert.equal(await prisma.clockAlert.count({ where: { breakId: rollbackPause.id } }), 0);
    await runClockSweep();
    assert.equal((await prisma.clockBreak.findUniqueOrThrow({ where: { id: rollbackPause.id } })).endReason, "LIMIT");
    check("A transaction failure rolls back the break end, audit and flag together; the next sweep safely retries");
    for (let i = 0; i < 24; i++) {
      const start = new Date(Date.UTC(2026, 8, 1, 0, 0, i));
      await prisma.clockShift.create({ data: { userId: staff.id, personName: staff.name, startedAt: start, endedAt: new Date(start.getTime() + 15 * 3600_000), startDay: centralDayKey(start), startWeek: centralWeekKey(start), startRequestId: randomUUID(),
        alerts: { create: { eventKey: `history-${prefix}-${i}`, kind: "OPEN_SHIFT", occurredAt: new Date(start.getTime() + 14 * 3600_000), recordedAt: new Date() } } } });
    }
    const firstPage = await listClockAlerts(staff.id, "all"); assert.equal(firstPage.alerts.length, 20); assert.ok(firstPage.hasMore && firstPage.nextBefore);
    const nextPage = await listClockAlerts(staff.id, "all", firstPage.nextBefore!);
    assert.ok(nextPage.alerts.length); assert.ok(!nextPage.alerts.some((a) => firstPage.alerts.some((b) => b.id === a.id)));
    await expect(() => listClockAlerts(general.id, "all", firstPage.nextBefore!), 400);
    check("Alert history is bounded and cursor pages do not overlap or expose another person's records");
    const auth = await createSession({ userId: staff.id, expiresAt: new Date(Date.now() + 3600_000) });
    const cookie = `xyz_session=${auth.token}`, origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/clock`;
    const req = (path: string, method = "GET", body?: object, signedIn = true) => fetch(`${origin}${path}`, { method, headers: { ...(signedIn ? { cookie } : {}), "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal((await req("/alerts", "GET", undefined, false)).status, 401);
    const response = await req("/alerts"); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await req("/alerts?userId=someone-else")).status, 400);
    assert.equal((await req("/alerts?filter[]=all")).status, 400);
    assert.equal((await req(`/alerts/${reminder.id}/read`, "POST", { userId: otherManager.id })).status, 400);
    await prisma.user.update({ where: { id: staff.id }, data: { status: "DEACTIVATED" } });
    assert.equal((await req("/alerts")).status, 401); await expect(() => listClockAlerts(staff.id), 401);
    process.env.BLOCK2_CLOCK_ENABLED = "false"; assert.equal((await req("/alerts")).status, 404); process.env.BLOCK2_CLOCK_ENABLED = "true";
    check("Authenticated no-store API rejects caller-selected identities/invalid filters, inactive accounts and disabled features");
    // A deleted login leaves a complete system event/history, with no stale
    // recipient grant and no login required for background limit processing.
    await prisma.user.delete({ where: { id: second.id } });
    assert.equal((await prisma.clockShift.findUniqueOrThrow({ where: { id: unassignedShift.id } })).userId, null);
    assert.ok((await listClockAlerts(owner.id, "all")).alerts.some((a) => a.personName === second.name));
    check("Deleting an account retains alert history/person snapshots for authorized agency oversight");
    console.log(`Passed ${passed} attendance-alert integration groups.`);
  } finally {
    const shifts = await prisma.clockShift.findMany({ where: { personName: { startsWith: prefix } }, select: { id: true } }); const shiftIds = shifts.map((s) => s.id);
    await prisma.auditEvent.deleteMany({ where: { OR: [{ actorUserId: { in: users } }, { targetId: { in: shiftIds }, targetType: "clock" }] } });
    await prisma.clockAlert.deleteMany({ where: { shiftId: { in: shiftIds } } });
    await prisma.clockBreak.deleteMany({ where: { shiftId: { in: shiftIds } } }); await prisma.clockShift.deleteMany({ where: { id: { in: shiftIds } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } }); await prisma.agencyModel.deleteMany({ where: { id: { in: models } } }); await prisma.role.deleteMany({ where: { id: { in: customRoles } } });
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
