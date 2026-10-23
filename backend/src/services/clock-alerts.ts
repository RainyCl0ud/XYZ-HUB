import { ClockAlertKind, ClockBreakEndReason, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { BREAKS, ClockError, clockAllowed, clockDatabaseNow, clockViewerInclude, type ClockViewer } from "./clock-policy.js";
import { CLOCK_PERMISSION_DEFINITIONS, CLOCK_ROLE_DEFAULTS } from "../permissions/clock-permissions.js";

type Shift = Prisma.ClockShiftGetPayload<{ include: { breaks: true } }>;
const alertInclude = { shift: { include: { breaks: true } } } satisfies Prisma.ClockAlertInclude;
type Alert = Prisma.ClockAlertGetPayload<{ include: typeof alertInclude }>;

async function recordAlert(tx: Prisma.TransactionClient, shift: Shift, now: Date, kind: ClockAlertKind, due: Date, pause?: Shift["breaks"][number]) {
  const eventKey = `${pause?.id ?? shift.id}:${kind}`;
  const created = await tx.clockAlert.createMany({ data: { eventKey, shiftId: shift.id, breakId: pause?.id, breakKind: pause?.kind, kind, occurredAt: due, recordedAt: now }, skipDuplicates: true });
  if (created.count) await tx.auditEvent.create({ data: {
    action: kind === "BREAK_REMINDER" ? "clock.break.reminder" : kind === "OPEN_SHIFT" ? "clock.shift.flag" : "clock.break.limit_flag",
    occurredAt: now, actorLabel: "Attendance system", success: true, statusCode: 200, targetType: "clock", targetId: shift.id,
    metadata: { personName: shift.personName, eventKey, dueAt: due.toISOString(), recordedAt: now.toISOString(), ...(pause ? { breakId: pause.id, kind: pause.kind } : {}), reason: kind === "OPEN_SHIFT" ? "Shift has been open for 14 hours; no automatic clock-out." : kind === "BREAK_REMINDER" ? "Five minutes past the planned paid break length." : "Paid break reached its maximum length; management flag recorded." },
  } });
}

/** Caller holds the person's User row lock (or the orphaned Shift row lock).
 * Reads, manual actions and the background worker use the same transaction. */
export async function reconcileClockShift(tx: Prisma.TransactionClient, shift: Shift, now: Date) {
  if (shift.endedAt) return;
  for (const pause of shift.breaks.filter((b) => !b.endedAt)) {
    const rule = BREAKS[pause.kind];
    const reminder = new Date(pause.startedAt.getTime() + (rule.allowanceSeconds + 300) * 1000);
    const limit = new Date(pause.startedAt.getTime() + rule.limitSeconds * 1000);
    if (now >= limit) {
      await tx.clockBreak.update({ where: { id: pause.id }, data: { endedAt: limit, endReason: "LIMIT" } });
      await tx.auditEvent.create({ data: { occurredAt: now, actorLabel: "Attendance system", action: "clock.break.auto_end", success: true, statusCode: 200, targetType: "clock", targetId: shift.id,
        metadata: { personName: shift.personName, breakId: pause.id, kind: pause.kind, endedAt: limit.toISOString(), recordedAt: now.toISOString(), reason: "Maximum paid break length reached." } } });
      pause.endedAt = limit; pause.endReason = ClockBreakEndReason.LIMIT;
      await recordAlert(tx, shift, now, "BREAK_LIMIT", limit, pause);
    } else if (now >= reminder) {
      // After a restart beyond the limit, send only the current limit event,
      // rather than creating an obsolete reminder for a break already ended.
      await recordAlert(tx, shift, now, "BREAK_REMINDER", reminder, pause);
    }
  }
  const longShift = new Date(shift.startedAt.getTime() + 14 * 3600_000);
  if (now >= longShift) await recordAlert(tx, shift, now, "OPEN_SHIFT", longShift);
}

function audience(viewer: ClockViewer): Prisma.ClockAlertWhereInput {
  const own: Prisma.ClockAlertWhereInput[] = clockAllowed(viewer, "clock.self.view") ? [{ shift: { userId: viewer.id } }] : [];
  const managementKinds: ClockAlertKind[] = ["BREAK_LIMIT", "OPEN_SHIFT"];
  if (clockAllowed(viewer, "clock.alerts.all")) own.push({ kind: { in: managementKinds } });
  else if (clockAllowed(viewer, "clock.alerts.team")) own.push({ kind: { in: managementKinds }, shift: { userId: { not: viewer.id }, user: {
    // Current assignments only; no historical QA, team hierarchy or stored
    // recipient list can retain access after a person moves creators.
    modelAssignments: { some: { modelId: { in: viewer.modelAssignments.map((a) => a.modelId) }, model: { isActive: true } } },
    roleMemberships: { none: { role: { archivedAt: null, systemKey: { in: ["ACCOUNTANT", "GENERAL_STAFF"] } } } },
  } } });
  return { OR: own };
}
async function withAudience<T>(userId: string, fn: (tx: Prisma.TransactionClient, viewer: ClockViewer, now: Date, where: Prisma.ClockAlertWhereInput) => Promise<T>, write = false) {
  return prisma.$transaction(async (tx) => {
    // A single snapshot keeps page rows/counts and role/assignment checks
    // consistent. Every subsequent request re-evaluates access.
    const viewer = await tx.user.findUnique({ where: { id: userId }, include: clockViewerInclude });
    if (!viewer || viewer.status !== "ACTIVE") throw new ClockError(401, "Please sign in again.");
    if (!clockAllowed(viewer, "clock.access") || !["clock.self.view", "clock.alerts.team", "clock.alerts.all"].some((p) => clockAllowed(viewer, p))) throw new ClockError(403, "Attendance alerts are not available for your current access.");
    return fn(tx, viewer, await clockDatabaseNow(tx), audience(viewer));
  }, { isolationLevel: write ? Prisma.TransactionIsolationLevel.ReadCommitted : Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 10_000 });
}
function describe(alert: Alert, viewerId: string) {
  const own = alert.shift.userId === viewerId;
  const pause = alert.shift.breaks.find((b) => b.id === alert.breakId);
  const label = alert.breakKind ? BREAKS[alert.breakKind].label : "Shift";
  const resolved = alert.kind === "OPEN_SHIFT" ? !!alert.shift.endedAt : !!pause?.endedAt;
  const title = alert.kind === "BREAK_REMINDER" ? `${label}: return reminder` : alert.kind === "BREAK_LIMIT" ? `${label} ended automatically` : "Shift open for 14 hours";
  const message = alert.kind === "BREAK_REMINDER"
    ? resolved ? "This break has ended. Its time remains paid." : "Your break is at least five minutes past its planned length. Please end your break when you return. All break time remains paid."
    : alert.kind === "BREAK_LIMIT" ? `The break ended at its ${alert.breakKind === "MEAL" ? "60" : "30"}-minute limit. All break time remains included in worked hours.`
    : resolved ? "This shift has now been clocked out. Its recorded hours remain saved." : own ? "Your shift is still open. If you have finished, clock out. If the recorded time needs changing, contact management." : "This person's shift is still open. Check whether they forgot to clock out; their hours have not been changed.";
  return { id: alert.id, kind: alert.kind, personName: own ? "You" : alert.shift.personName, own, title, message, occurredAt: alert.occurredAt, recordedAt: alert.recordedAt, status: alert.kind === "BREAK_LIMIT" ? "Break ended" : resolved ? "Ended" : "Still open" };
}
export function listClockAlerts(userId: string, filter: "unread" | "all" = "unread", before?: string) {
  return withAudience(userId, async (tx, viewer, now, allowed) => {
    const unread: Prisma.ClockAlertWhereInput = { reads: { none: { userId } } };
    let cursor: { occurredAt: Date; id: string } | null = null;
    if (before) {
      cursor = await tx.clockAlert.findFirst({ where: { AND: [allowed, { id: before }] }, select: { occurredAt: true, id: true } });
      if (!cursor) throw new ClockError(400, "The alert history cursor is invalid.");
    }
    const rows = await tx.clockAlert.findMany({ where: { AND: [allowed, ...(filter === "unread" ? [unread] : []), ...(cursor ? [{ OR: [{ occurredAt: { lt: cursor.occurredAt } }, { occurredAt: cursor.occurredAt, id: { lt: cursor.id } }] }] : [])] },
      include: { ...alertInclude, reads: { where: { userId }, select: { readAt: true } } }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 21 });
    return { serverNow: now, unreadCount: await tx.clockAlert.count({ where: { AND: [allowed, unread] } }),
      canReviewStaff: clockAllowed(viewer, "clock.alerts.all") || clockAllowed(viewer, "clock.alerts.team"),
      alerts: rows.slice(0, 20).map((a) => ({ ...describe(a, userId), readAt: a.reads[0]?.readAt ?? null })), hasMore: rows.length > 20, nextBefore: rows.length > 20 ? rows[19].id : null };
  });
}
export function markClockAlertRead(userId: string, alertId: string) {
  return withAudience(userId, async (tx, _viewer, now, allowed) => {
    if (!await tx.clockAlert.findFirst({ where: { AND: [allowed, { id: alertId }] }, select: { id: true } })) throw new ClockError(404, "Alert not found.");
    // INSERT ... ON CONFLICT DO NOTHING keeps the first read time and makes
    // simultaneous acknowledgements from two tabs safe without an upsert race.
    await tx.clockAlertRead.createMany({ data: { alertId, userId, readAt: now }, skipDuplicates: true });
    return { read: true };
  }, true);
}
export async function installClockAlertDefaults(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(62942119)`;
  if (await tx.clockSetup.findUnique({ where: { id: "clock-alerts-v1" } })) return false;
  for (const definition of CLOCK_PERMISSION_DEFINITIONS.filter((p) => p.key.startsWith("clock.alerts."))) {
    const { requires: _requires, ...data } = definition;
    const permission = await tx.permission.upsert({ where: { key: data.key }, create: data, update: {} });
    const roles = await tx.role.findMany({ where: { archivedAt: null, systemKey: { in: Object.keys(CLOCK_ROLE_DEFAULTS).filter((key) => CLOCK_ROLE_DEFAULTS[key].includes(data.key)) } } });
    await tx.rolePermission.createMany({ data: roles.map((r) => ({ roleId: r.id, permissionId: permission.id })), skipDuplicates: true });
  }
  await tx.clockSetup.create({ data: { id: "clock-alerts-v1" } });
  await tx.auditEvent.create({ data: { action: "clock.alert_defaults.install", success: true, statusCode: 200, targetType: "clock", metadata: { version: 1 } } });
  return true;
}
