import { Prisma, ClockBreakKind } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { CLOCK_PERMISSION_DEFINITIONS, CLOCK_ROLE_DEFAULTS } from "../permissions/clock-permissions.js";
import { centralDayKey, centralWeekKey, elapsedSeconds } from "./clock-time.js";

export const isClockEnabled = () => process.env.BLOCK2_CLOCK_ENABLED === "true";
export { ClockError, BREAKS } from "./clock-policy.js";
import { ClockError, BREAKS, clockAllowed as allowed, clockViewerInclude as viewerInclude, type ClockViewer as Viewer, clockDatabaseNow } from "./clock-policy.js";
import { clockRecordVersion } from "./clock-record.js";
import { correctionCapabilities } from "./clock-corrections.js";
import { reconcileClockShift } from "./clock-alerts.js";
const include = { corrections: { where: { status: "APPROVED" as const }, select: { id: true } }, breaks: { orderBy: { startedAt: "asc" as const } } } satisfies Prisma.ClockShiftInclude;
type Shift = Prisma.ClockShiftGetPayload<{ include: typeof include }>;
function canTrack(viewer: Viewer) { return allowed(viewer, "clock.self.track") && !allowed(viewer, "clock.exempt"); }
async function withViewer<T>(userId: string, action: (tx: Prisma.TransactionClient, viewer: Viewer, now: Date) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    // Serialize all reads/mutations for one person, including requests from two
    // tabs. The partial unique indexes provide a second database-level guard.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const viewer = await tx.user.findUnique({ where: { id: userId }, include: viewerInclude });
    if (!viewer || viewer.status !== "ACTIVE") throw new ClockError(401, "Please sign in again.");
    if (!allowed(viewer, "clock.self.view")) throw new ClockError(403, "Access to your hours is required.");
    return action(tx, viewer, await clockDatabaseNow(tx));
  }, { timeout: 15_000 });
}
function requireTrack(viewer: Viewer) {
  if (!canTrack(viewer)) throw new ClockError(403, "Your current access does not allow clocking in or changing attendance.");
}
async function audit(tx: Prisma.TransactionClient, viewer: Viewer, action: string, shiftId: string, now: Date, metadata: Prisma.InputJsonObject) {
  await tx.auditEvent.create({ data: { occurredAt: now, action: `clock.${action}`, success: true, statusCode: 200, actorUserId: viewer.id, actorLabel: viewer.name, targetType: "clock", targetId: shiftId, metadata } });
}
async function ownedShift(tx: Prisma.TransactionClient, userId: string, shiftId: string) {
  const shift = await tx.clockShift.findFirst({ where: { id: shiftId, userId }, include });
  if (!shift) throw new ClockError(404, "Shift not found.");
  return shift;
}
function shiftDto(shift: Shift, now: Date) {
  const end = shift.endedAt ?? now;
  return { id: shift.id, recordVersion: clockRecordVersion(shift), correctionCount: shift.corrections.length, personName: shift.personName, startedAt: shift.startedAt, endedAt: shift.endedAt, startDay: shift.startDay, startWeek: shift.startWeek,
    workedSeconds: elapsedSeconds(shift.startedAt, end),
    paidBreakSeconds: shift.breaks.reduce((sum, b) => sum + elapsedSeconds(b.startedAt, b.endedAt ?? end), 0),
    breaks: shift.breaks.map((b) => ({ id: b.id, kind: b.kind, label: BREAKS[b.kind].label, startedAt: b.startedAt, endedAt: b.endedAt, endReason: b.endReason,
      elapsedSeconds: elapsedSeconds(b.startedAt, b.endedAt ?? end), allowanceSeconds: BREAKS[b.kind].allowanceSeconds, limitSeconds: BREAKS[b.kind].limitSeconds })),
  };
}
async function state(tx: Prisma.TransactionClient, viewer: Viewer, now: Date, before?: string) {
  const current = await tx.clockShift.findFirst({ where: { userId: viewer.id, endedAt: null }, include });
  if (current) await reconcileClockShift(tx, current, now);
  let cursor: { startedAt: Date; id: string } | null = null;
  if (before) {
    cursor = await tx.clockShift.findFirst({ where: { userId: viewer.id, id: before }, select: { startedAt: true, id: true } });
    if (!cursor) throw new ClockError(400, "The history cursor is invalid.");
  }
  const history = await tx.clockShift.findMany({ where: { userId: viewer.id, endedAt: { not: null }, ...(cursor ? { OR: [{ startedAt: { lt: cursor.startedAt } }, { startedAt: cursor.startedAt, id: { lt: cursor.id } }] } : {}) }, include, orderBy: [{ startedAt: "desc" }, { id: "desc" }], take: 26 });
  const weekKey = centralWeekKey(now), dayKey = centralDayKey(now);
  const weekShifts = await tx.clockShift.findMany({ where: { userId: viewer.id, startWeek: weekKey }, select: { startedAt: true, endedAt: true, startDay: true } });
  const corrections = await tx.clockCorrection.aggregate({ where: { userId: viewer.id, status: "APPROVED" }, _count: { _all: true }, _max: { reviewedAt: true } });
  return { serverNow: now, historyVersion: `${corrections._count._all}:${corrections._max.reviewedAt?.toISOString() ?? "none"}`, ...correctionCapabilities(viewer), timeZone: "America/Chicago", canTrack: canTrack(viewer), exempt: allowed(viewer, "clock.exempt"),
    currentShift: current ? shiftDto(current, now) : null,
    history: history.slice(0, 25).map((s) => shiftDto(s, now)), hasMore: history.length > 25, nextBefore: history.length > 25 ? history[24].id : null,
    totals: { dayKey, weekKey, todaySeconds: weekShifts.filter((s) => s.startDay === dayKey).reduce((n, s) => n + elapsedSeconds(s.startedAt, s.endedAt ?? now), 0),
      weekSeconds: weekShifts.reduce((n, s) => n + elapsedSeconds(s.startedAt, s.endedAt ?? now), 0) },
  };
}
export function getOwnClock(userId: string, before?: string) { return withViewer(userId, (tx, viewer, now) => state(tx, viewer, now, before)); }
export function clockIn(userId: string, input: { requestId: string }) {
  return withViewer(userId, async (tx, viewer, now) => {
    requireTrack(viewer);
    const replay = await tx.clockShift.findUnique({ where: { startRequestId: input.requestId } });
    if (replay) {
      if (replay.userId !== userId) throw new ClockError(409, "Please retry with a new request.");
      return state(tx, viewer, now);
    }
    if (await tx.clockShift.findFirst({ where: { userId, endedAt: null } })) throw new ClockError(409, "You are already clocked in. Refresh to see your current shift.");
    const shift = await tx.clockShift.create({ data: { userId, personName: viewer.name,
      startedAt: now, startDay: centralDayKey(now), startWeek: centralWeekKey(now), startRequestId: input.requestId } });
    await audit(tx, viewer, "in", shift.id, now, { personName: viewer.name, startedAt: now.toISOString(), startDay: shift.startDay, startWeek: shift.startWeek });
    return state(tx, viewer, now);
  });
}
export function clockOut(userId: string, shiftId: string) {
  return withViewer(userId, async (tx, viewer, now) => {
    requireTrack(viewer);
    const shift = await ownedShift(tx, userId, shiftId);
    if (shift.endedAt) return state(tx, viewer, now);
    if (now < shift.startedAt) throw new ClockError(409, "The server clock is earlier than this shift. Ask an Owner to investigate.");
    await reconcileClockShift(tx, shift, now);
    for (const pause of shift.breaks.filter((b) => !b.endedAt)) {
      await tx.clockBreak.update({ where: { id: pause.id }, data: { endedAt: now, endReason: "CLOCK_OUT" } });
      await audit(tx, viewer, "break.end", shift.id, now, { breakId: pause.id, kind: pause.kind, endedAt: now.toISOString(), reason: "Clocked out" });
    }
    await tx.clockShift.update({ where: { id: shift.id }, data: { endedAt: now } });
    await audit(tx, viewer, "out", shift.id, now, { endedAt: now.toISOString(), workedSeconds: elapsedSeconds(shift.startedAt, now), paidBreaksIncluded: true });
    return state(tx, viewer, now);
  });
}
export function startBreak(userId: string, shiftId: string, input: { kind: ClockBreakKind; requestId: string }) {
  return withViewer(userId, async (tx, viewer, now) => {
    requireTrack(viewer);
    const shift = await ownedShift(tx, userId, shiftId);
    const replay = await tx.clockBreak.findUnique({ where: { startRequestId: input.requestId } });
    if (replay) {
      if (replay.shiftId !== shift.id || replay.kind !== input.kind) throw new ClockError(409, "Please retry with a new request.");
      return state(tx, viewer, now);
    }
    if (shift.endedAt) throw new ClockError(409, "This shift has ended. Clock in before taking a break.");
    await reconcileClockShift(tx, shift, now);
    if (shift.breaks.some((b) => !b.endedAt)) throw new ClockError(409, "End your current break before starting another.");
    if (shift.breaks.some((b) => b.kind === input.kind)) throw new ClockError(409, "You have already used this break in this shift.");
    if (now < shift.startedAt) throw new ClockError(409, "The server clock is earlier than this shift. Ask an Owner to investigate.");
    const pause = await tx.clockBreak.create({ data: { shiftId, kind: input.kind, startedAt: now, startRequestId: input.requestId } });
    await audit(tx, viewer, "break.start", shiftId, now, { breakId: pause.id, kind: pause.kind, startedAt: now.toISOString(), paid: true });
    return state(tx, viewer, now);
  });
}
export function endBreak(userId: string, shiftId: string, breakId: string) {
  return withViewer(userId, async (tx, viewer, now) => {
    requireTrack(viewer);
    const shift = await ownedShift(tx, userId, shiftId);
    const pause = shift.breaks.find((b) => b.id === breakId);
    if (!pause) throw new ClockError(404, "Break not found.");
    if (!pause.endedAt && now < pause.startedAt) throw new ClockError(409, "The server clock is earlier than this break. Ask an Owner to investigate.");
    await reconcileClockShift(tx, shift, now);
    if (!pause.endedAt && !shift.endedAt) {
      await tx.clockBreak.update({ where: { id: pause.id }, data: { endedAt: now, endReason: "MANUAL" } });
      await audit(tx, viewer, "break.end", shift.id, now, { breakId, kind: pause.kind, endedAt: now.toISOString(), reason: "Returned from break" });
    }
    return state(tx, viewer, now);
  });
}
export async function installClockDefaults(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(62942119)`;
  if (await tx.clockSetup.findUnique({ where: { id: "clock-core-v1" } })) return false;
  for (const definition of CLOCK_PERMISSION_DEFINITIONS) {
    const { requires: _requires, ...data } = definition;
    const permission = await tx.permission.upsert({ where: { key: data.key }, create: data, update: {} });
    const roles = await tx.role.findMany({ where: { archivedAt: null, systemKey: { in: Object.keys(CLOCK_ROLE_DEFAULTS).filter((key) => CLOCK_ROLE_DEFAULTS[key].includes(data.key)) } } });
    await tx.rolePermission.createMany({ data: roles.map((r) => ({ roleId: r.id, permissionId: permission.id })), skipDuplicates: true });
  }
  await tx.clockSetup.create({ data: { id: "clock-core-v1" } });
  await tx.auditEvent.create({ data: { action: "clock.defaults.install", success: true, statusCode: 200, targetType: "clock", metadata: { version: 1 } } });
  return true;
}
