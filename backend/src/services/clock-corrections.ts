import { ClockCorrectionStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { CLOCK_PERMISSION_DEFINITIONS, CLOCK_ROLE_DEFAULTS } from "../permissions/clock-permissions.js";
import { ClockError, clockAllowed, clockDatabaseNow, clockViewerInclude, type ClockViewer } from "./clock-policy.js";
import { clockRecordVersion, clockSnapshot } from "./clock-record.js";
import { centralDayKey, centralWeekKey } from "./clock-time.js";

const timestamp = z.string().datetime({ offset: true }).max(40);
const breakSchema = z.object({ kind: z.enum(["SHORT_ONE", "SHORT_TWO", "MEAL"]), startedAt: timestamp, endedAt: timestamp }).strict();
export const correctionProposalSchema = z.object({ startedAt: timestamp, endedAt: timestamp, breaks: z.array(breakSchema).max(3) }).strict();
export const correctionRequestSchema = z.object({
  requestId: z.string().uuid(), shiftId: z.string().min(1).max(100).optional(),
  expectedVersion: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  reason: z.string().trim().min(1).max(2000), proposed: correctionProposalSchema,
}).strict().refine((v) => !!v.shiftId === !!v.expectedVersion, "Choose a recorded shift or request a missing shift.");
export const correctionDecisionSchema = z.object({ decision: z.enum(["APPROVED", "REJECTED"]), note: z.string().trim().min(1).max(2000) }).strict();
type Proposal = z.infer<typeof correctionProposalSchema>;
type RequestInput = z.infer<typeof correctionRequestSchema>;
const correctionInclude = { shift: { include: { breaks: true } }, subject: { include: clockViewerInclude } } satisfies Prisma.ClockCorrectionInclude;
type Correction = Prisma.ClockCorrectionGetPayload<{ include: typeof correctionInclude }>;
const ownerRoutes = ["OWNER", "OPS_MANAGER", "DEV", "MODEL"];
const opsRoutes = ["MANAGER", "ACCOUNTANT", "GENERAL_STAFF"];
const hasRole = (user: ClockViewer, keys: string[]) => user.roleMemberships.some((m) => keys.includes(m.role.systemKey ?? ""));
function routeFor(subject: ClockViewer | null): "OWNER" | "OPS" | "ASSIGNED" {
  if (!subject || hasRole(subject, ownerRoutes)) return "OWNER";
  if (hasRole(subject, opsRoutes) || !subject.modelAssignments.length) return "OPS";
  return "ASSIGNED";
}
export function correctionCapabilities(viewer: ClockViewer) {
  return {
    canRequestCorrections: clockAllowed(viewer, "clock.corrections.request"),
    canReviewCorrections: ["assigned", "ops", "all"].some((scope) => clockAllowed(viewer, `clock.corrections.${scope}`)),
  };
}
function reviewWhere(viewer: ClockViewer): Prisma.ClockCorrectionWhereInput {
  const routes: Prisma.ClockCorrectionWhereInput[] = [];
  if (clockAllowed(viewer, "clock.corrections.all")) return { OR: [{ userId: { not: viewer.id } }, { userId: null }] };
  if (clockAllowed(viewer, "clock.corrections.ops")) routes.push({ subject: {
    roleMemberships: { none: { role: { archivedAt: null, systemKey: { in: ownerRoutes } } } },
    OR: [
      { roleMemberships: { some: { role: { archivedAt: null, systemKey: { in: opsRoutes } } } } },
      { modelAssignments: { none: { model: { isActive: true } } } },
    ],
  } });
  if (clockAllowed(viewer, "clock.corrections.assigned")) routes.push({ subject: {
    roleMemberships: { none: { role: { archivedAt: null, systemKey: { in: [...ownerRoutes, ...opsRoutes] } } } },
    modelAssignments: { some: { modelId: { in: viewer.modelAssignments.map((a) => a.modelId) }, model: { isActive: true } } },
  } });
  // An empty OR matches nothing. Own requests stay exclusively in My requests.
  return { AND: [{ OR: [{ userId: { not: viewer.id } }, { userId: null }] }, { OR: routes }] };
}
function assertCanReview(viewer: ClockViewer, item: Correction) {
  if (item.userId === viewer.id) throw new ClockError(403, "You cannot approve or reject your own correction. You can cancel it instead.");
  const route = routeFor(item.subject);
  const shared = item.subject?.modelAssignments.some((a) => viewer.modelAssignments.some((b) => a.modelId === b.modelId));
  if (!clockAllowed(viewer, "clock.corrections.all") &&
    !(route === "OPS" && clockAllowed(viewer, "clock.corrections.ops")) &&
    !(route === "ASSIGNED" && shared && clockAllowed(viewer, "clock.corrections.assigned"))) {
    throw new ClockError(404, "Correction request not found.");
  }
}
async function loadViewer(tx: Prisma.TransactionClient, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId }, include: clockViewerInclude });
  if (!user || user.status !== "ACTIVE") throw new ClockError(401, "Please sign in again.");
  if (!clockAllowed(user, "clock.self.view")) throw new ClockError(403, "Access to attendance is required.");
  return user;
}
async function lockPeople(tx: Prisma.TransactionClient, ids: string[]) {
  // Use the same person lock as the clock and background worker. Stable order
  // prevents two reviewers of each other's requests from deadlocking.
  for (const id of [...new Set(ids)].sort()) await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
}
function normalizeProposal(input: Proposal, now: Date): Proposal {
  const normalize = (value: string) => {
    const d = new Date(value);
    if (!Number.isFinite(d.getTime()) || d.getMilliseconds() !== 0) throw new ClockError(400, "Enter valid times to the second.");
    return d.toISOString();
  };
  const proposed = { startedAt: normalize(input.startedAt), endedAt: normalize(input.endedAt),
    breaks: input.breaks.map((b) => ({ kind: b.kind, startedAt: normalize(b.startedAt), endedAt: normalize(b.endedAt) })).sort((a, b) => a.kind.localeCompare(b.kind)) };
  if (proposed.endedAt <= proposed.startedAt) throw new ClockError(400, "Clock-out must be after clock-in.");
  if (new Date(proposed.endedAt) > now) throw new ClockError(400, "A correction cannot record time in the future.");
  if (new Set(proposed.breaks.map((b) => b.kind)).size !== proposed.breaks.length) throw new ClockError(400, "Each paid break can appear only once.");
  for (const b of proposed.breaks) {
    if (b.startedAt < proposed.startedAt || b.endedAt > proposed.endedAt || b.endedAt < b.startedAt) throw new ClockError(400, "Every break must fit inside the proposed shift and end at or after it starts.");
  }
  const byTime = [...proposed.breaks].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  for (let i = 1; i < byTime.length; i++) if (byTime[i].startedAt < byTime[i - 1].endedAt) throw new ClockError(400, "Paid breaks cannot overlap.");
  return proposed;
}
async function assertNoShiftOverlap(tx: Prisma.TransactionClient, userId: string, proposed: Proposal, ignoreId?: string) {
  const overlaps = await tx.clockShift.findFirst({ where: {
    userId, ...(ignoreId ? { id: { not: ignoreId } } : {}), startedAt: { lt: new Date(proposed.endedAt) },
    OR: [{ endedAt: null }, { endedAt: { gt: new Date(proposed.startedAt) } }],
  }, select: { id: true } });
  if (overlaps) throw new ClockError(409, "These times overlap another recorded shift. Review your history before submitting or approving.");
}
function dto(item: Correction) {
  const stale = item.status === "PENDING" && item.kind === "SHIFT_TIMES" && (!item.shift || clockRecordVersion(item.shift) !== item.basisVersion);
  const route = routeFor(item.subject);
  return { id: item.id, shiftId: item.shiftId, kind: item.kind, correctionKind: item.kind, correctionStatus: item.status, status: item.status, personName: item.personName,
    reason: item.reason, before: item.beforeSnapshot, proposed: item.proposedSnapshot, submittedAt: item.submittedAt,
    reviewerName: item.reviewerName, reviewNote: item.reviewNote, reviewedAt: item.reviewedAt,
    stale, subjectAvailable: !!item.userId,
    route: route === "OWNER" ? "Owner review" : route === "OPS" ? "Ops or Owner review" : "Assigned Manager or Owner review",
  };
}
async function correctionAudit(tx: Prisma.TransactionClient, viewer: ClockViewer, item: Correction, action: string, now: Date, note?: string) {
  await tx.auditEvent.create({ data: {
    occurredAt: now, action: `clock.correction.${action}`, success: true, statusCode: 200,
    actorUserId: viewer.id, actorLabel: viewer.name, targetType: "clock", targetId: item.shiftId ?? item.id,
    metadata: { personName: item.personName, correctionId: item.id, shiftId: item.shiftId, correctionKind: item.kind, correctionStatus: item.status,
      reason: item.reason, reviewNote: note ?? null, before: item.beforeSnapshot, after: item.proposedSnapshot },
  } });
}
export async function listClockCorrections(userId: string, scope: "mine" | "review" = "mine", filter: "pending" | "all" = "all", before?: string) {
  return prisma.$transaction(async (tx) => {
    const viewer = await loadViewer(tx, userId);
    const capabilities = correctionCapabilities(viewer);
    if (scope === "review" && !capabilities.canReviewCorrections) throw new ClockError(403, "Your access does not allow reviewing corrections.");
    const audience: Prisma.ClockCorrectionWhereInput = scope === "mine" ? { userId } : reviewWhere(viewer);
    let cursor: { submittedAt: Date; id: string } | null = null;
    if (before) {
      cursor = await tx.clockCorrection.findFirst({ where: { AND: [audience, { id: before }] }, select: { submittedAt: true, id: true } });
      if (!cursor) throw new ClockError(400, "The correction history cursor is invalid.");
    }
    const rows = await tx.clockCorrection.findMany({ where: { AND: [audience,
      ...(filter === "pending" ? [{ status: ClockCorrectionStatus.PENDING }] : []),
      ...(cursor ? [{ OR: [{ submittedAt: { lt: cursor.submittedAt } }, { submittedAt: cursor.submittedAt, id: { lt: cursor.id } }] }] : []),
    ] }, include: correctionInclude, orderBy: [{ submittedAt: "desc" }, { id: "desc" }], take: 21 });
    return { serverNow: await clockDatabaseNow(tx), ...capabilities, requests: rows.slice(0, 20).map(dto),
      hasMore: rows.length > 20, nextBefore: rows.length > 20 ? rows[19].id : null,
      ownPendingCount: await tx.clockCorrection.count({ where: { userId, status: "PENDING" } }),
      reviewPendingCount: capabilities.canReviewCorrections ? await tx.clockCorrection.count({ where: { AND: [reviewWhere(viewer), { status: "PENDING" }] } }) : 0,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15_000 });
}
/** Direct request lookup for the details page. Re-check live reviewer permissions on each read. */
export async function getClockCorrection(userId: string, correctionId: string) {
  return prisma.$transaction(async (tx) => {
    const viewer = await loadViewer(tx, userId);
    const item = await tx.clockCorrection.findUnique({
      where: { id: correctionId },
      include: correctionInclude,
    });
    if (!item) throw new ClockError(404, "Correction request not found.");

    const scope = item.userId === viewer.id ? "mine" : "review";
    if (scope === "review") {
      // Do not reveal another employee's request or its existence to unauthorized users.
      if (!correctionCapabilities(viewer).canReviewCorrections) {
        throw new ClockError(404, "Correction request not found.");
      }
      assertCanReview(viewer, item);
    }

    return { request: dto(item), scope, canReviewCorrections: scope === "review" };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15_000 });
}

export async function requestClockCorrection(userId: string, input: RequestInput) {
  return prisma.$transaction(async (tx) => {
    await lockPeople(tx, [userId]);
    const viewer = await loadViewer(tx, userId);
    if (!correctionCapabilities(viewer).canRequestCorrections) throw new ClockError(403, "Your access does not allow correction requests.");
    const now = await clockDatabaseNow(tx);
    const proposed = normalizeProposal(input.proposed, now);
    const replay = await tx.clockCorrection.findUnique({ where: { requestId: input.requestId }, include: correctionInclude });
    if (replay) {
      if (replay.userId !== userId || replay.reason !== input.reason || JSON.stringify(normalizeProposal(correctionProposalSchema.parse(replay.proposedSnapshot), now)) !== JSON.stringify(proposed) ||
        replay.kind !== (input.shiftId ? "SHIFT_TIMES" : "MISSING_SHIFT") || (input.shiftId && replay.shiftId !== input.shiftId)) {
        throw new ClockError(409, "This request ID was already used. Start a new request.");
      }
      return dto(replay);
    }
    const shift = input.shiftId ? await tx.clockShift.findFirst({ where: { id: input.shiftId, userId }, include: { breaks: true } }) : null;
    if (input.shiftId && !shift) throw new ClockError(404, "Shift not found.");
    if (!shift && (clockAllowed(viewer, "clock.exempt") || !clockAllowed(viewer, "clock.self.track"))) throw new ClockError(403, "Your current access does not allow requesting a missing shift.");
    if (shift && clockRecordVersion(shift) !== input.expectedVersion) throw new ClockError(409, "This shift changed. Refresh your hours and start a new correction.");
    if (shift?.breaks.some((b) => !proposed.breaks.some((p) => p.kind === b.kind))) throw new ClockError(400, "Keep every recorded break in the request. Its times can be corrected, including a zero-length accidental break.");
    if (shift && JSON.stringify({ startedAt: shift.startedAt.toISOString(), endedAt: shift.endedAt?.toISOString() ?? null, breaks: clockSnapshot(shift).breaks.map(({ kind, startedAt, endedAt }) => ({ kind, startedAt, endedAt })) }) === JSON.stringify(proposed)) {
      throw new ClockError(400, "Change at least one shift or break time before submitting.");
    }
    if (shift && await tx.clockCorrection.findFirst({ where: { shiftId: shift.id, status: "PENDING" }, select: { id: true } })) throw new ClockError(409, "This shift already has a pending request. Cancel it before submitting a replacement.");
    await assertNoShiftOverlap(tx, userId, proposed, shift?.id);
    const row = await tx.clockCorrection.create({ data: {
      requestId: input.requestId, userId, personName: viewer.name, shiftId: shift?.id,
      kind: shift ? "SHIFT_TIMES" : "MISSING_SHIFT", reason: input.reason,
      basisVersion: shift ? clockRecordVersion(shift) : null,
      beforeSnapshot: shift ? clockSnapshot(shift) : Prisma.DbNull,
      proposedSnapshot: proposed, submittedAt: now,
    }, include: correctionInclude });
    await correctionAudit(tx, viewer, row, "request", now);
    return dto(row);
  }, { timeout: 15_000 });
}
export async function reviewClockCorrection(userId: string, correctionId: string, decision: "APPROVED" | "REJECTED", note: string) {
  return prisma.$transaction(async (tx) => {
    const initial = await tx.clockCorrection.findUnique({ where: { id: correctionId }, select: { userId: true } });
    if (!initial) throw new ClockError(404, "Correction request not found.");
    await lockPeople(tx, [userId, ...(initial.userId ? [initial.userId] : [])]);
    const viewer = await loadViewer(tx, userId);
    await tx.$queryRaw`SELECT "id" FROM "ClockCorrection" WHERE "id" = ${correctionId} FOR UPDATE`;
    const item = await tx.clockCorrection.findUniqueOrThrow({ where: { id: correctionId }, include: correctionInclude });
    assertCanReview(viewer, item);
    if (item.status !== "PENDING") {
      if (item.status === decision && item.reviewerId === userId && item.reviewNote === note) return dto(item);
      throw new ClockError(409, "This request has already been decided. Refresh the list.");
    }
    const now = await clockDatabaseNow(tx);
    let shiftId = item.shiftId;
    if (decision === "APPROVED") {
      if (!item.userId) throw new ClockError(409, "The account was deleted. Its request history remains, but hours cannot be changed.");
      if (dto(item).stale) throw new ClockError(409, "The recorded shift changed after this request. Ask the person to cancel and resubmit with current times.");
      const proposed = normalizeProposal(correctionProposalSchema.parse(item.proposedSnapshot), now);
      await assertNoShiftOverlap(tx, item.userId, proposed, item.shiftId ?? undefined);
      const fields = { startedAt: new Date(proposed.startedAt), endedAt: new Date(proposed.endedAt), startDay: centralDayKey(new Date(proposed.startedAt)), startWeek: centralWeekKey(new Date(proposed.startedAt)) };
      const shift = item.shift
        ? await tx.clockShift.update({ where: { id: item.shift.id }, data: fields })
        : await tx.clockShift.create({ data: { ...fields, userId: item.userId, personName: item.personName, startRequestId: `clock-correction:${item.id}` } });
      shiftId = shift.id;
      for (const pause of proposed.breaks) {
        const previous = item.shift?.breaks.find((b) => b.kind === pause.kind);
        const times = { startedAt: new Date(pause.startedAt), endedAt: new Date(pause.endedAt) };
        if (!previous) await tx.clockBreak.create({ data: { ...times, shiftId, kind: pause.kind, endReason: "CORRECTION", startRequestId: `clock-correction:${item.id}:${pause.kind}` } });
        else if (previous.startedAt.getTime() !== times.startedAt.getTime() || previous.endedAt?.getTime() !== times.endedAt.getTime()) {
          await tx.clockBreak.update({ where: { id: previous.id }, data: { ...times, endReason: "CORRECTION" } });
        }
      }
    }
    const result = await tx.clockCorrection.update({ where: { id: item.id }, data: {
      status: decision, shiftId, reviewerId: userId, reviewerName: viewer.name, reviewNote: note, reviewedAt: now,
    }, include: correctionInclude });
    await correctionAudit(tx, viewer, result, decision === "APPROVED" ? "approve" : "reject", now, note);
    return dto(result);
  }, { timeout: 15_000 });
}
export async function cancelClockCorrection(userId: string, correctionId: string) {
  return prisma.$transaction(async (tx) => {
    await lockPeople(tx, [userId]);
    const viewer = await loadViewer(tx, userId);
    const item = await tx.clockCorrection.findFirst({ where: { id: correctionId, userId }, include: correctionInclude });
    if (!item) throw new ClockError(404, "Correction request not found.");
    if (item.status === "CANCELLED") return dto(item);
    if (item.status !== "PENDING") throw new ClockError(409, "A decided request cannot be cancelled.");
    const now = await clockDatabaseNow(tx);
    const result = await tx.clockCorrection.update({ where: { id: item.id }, data: { status: "CANCELLED", reviewerId: userId, reviewerName: viewer.name, reviewNote: "Cancelled by requester.", reviewedAt: now }, include: correctionInclude });
    await correctionAudit(tx, viewer, result, "withdraw", now);
    return dto(result);
  }, { timeout: 15_000 });
}
export async function installClockCorrectionDefaults(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(62942119)`;
  if (await tx.clockSetup.findUnique({ where: { id: "clock-corrections-v1" } })) return false;
  for (const definition of CLOCK_PERMISSION_DEFINITIONS.filter((p) => p.key.startsWith("clock.corrections."))) {
    const { requires: _requires, ...data } = definition;
    const permission = await tx.permission.upsert({ where: { key: data.key }, create: data, update: {} });
    const roles = await tx.role.findMany({ where: { archivedAt: null, systemKey: { in: Object.keys(CLOCK_ROLE_DEFAULTS).filter((key) => CLOCK_ROLE_DEFAULTS[key].includes(data.key)) } } });
    await tx.rolePermission.createMany({ data: roles.map((r) => ({ roleId: r.id, permissionId: permission.id })), skipDuplicates: true });
  }
  await tx.clockSetup.create({ data: { id: "clock-corrections-v1" } });
  await tx.auditEvent.create({ data: { action: "clock.correction_defaults.install", success: true, statusCode: 200, targetType: "clock", metadata: { version: 1 } } });
  return true;
}
