import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { ClockError, clockAllowed, clockDatabaseNow, clockViewerInclude } from "./clock-policy.js";
import { centralDayKey, elapsedSeconds } from "./clock-time.js";

const PAGE_SIZE = 20;
// Same 14-hour point at which the clock worker records an OPEN_SHIFT flag.
const LONG_SHIFT_MS = 14 * 3600_000;
// How many long shifts and breaks the Dashboard can list.
const ATTENTION_ROWS = 5;

/**
 * An explicitly permitted and rechecked attendance snapshot.
 * Role ranking never grants access by itself. Assigned views require a
 * shared active creator and a strictly subordinate active role.
 * Existing Owner-only endpoint remains Owner-only for older clients.
 */
async function readClockOverview(userId: string, before?: string, offShiftBefore?: string, requireOwner = false) {
  return prisma.$transaction(async (tx) => {
    const viewer = await tx.user.findUnique({
      where: { id: userId }, include: clockViewerInclude,
    });
    if (!viewer || viewer.status !== "ACTIVE") throw new ClockError(401, "Please sign in again.");
    const isOwner = viewer.roleMemberships.some((membership) => membership.role.systemKey === "OWNER");
    if (requireOwner && (!isOwner || !clockAllowed(viewer, "clock.self.view") || !clockAllowed(viewer, "clock.corrections.all"))) {
      throw new ClockError(403, "Only an active Owner can view agency attendance.");
    }
    if (!clockAllowed(viewer, "clock.access")) throw new ClockError(403, "Attendance access is unavailable.");

    const scope = clockAllowed(viewer, "clock.overview.agency") ? "agency"
      : clockAllowed(viewer, "clock.overview.team") ? "team"
      : clockAllowed(viewer, "clock.overview.chatters") ? "chatters" : null;
    // Both endpoints honor the new explicit Role Settings grant.
    // The legacy route additionally requires the active Owner role.
    const effectiveScope = scope;
    if (requireOwner && effectiveScope !== "agency") {
      throw new ClockError(403, "Agency attendance permission is required.");
    }
    if (!effectiveScope) throw new ClockError(403, "Attendance overview permission is required.");
    const viewerRanks = viewer.roleMemberships.map((m) => m.role.rank).filter((rank): rank is number => rank !== null);
    const highestRank = viewerRanks.length ? Math.min(...viewerRanks) : null;
    const assignedModels = viewer.modelAssignments.map((a) => a.modelId);
    // No active assignment naturally yields an empty scoped result.
    if (effectiveScope !== "agency" && highestRank === null) {
      throw new ClockError(403, "A ranked role is required for team attendance.");
    }

    const now = await clockDatabaseNow(tx);
    const workingStaff: Prisma.UserWhereInput = {
      status: "ACTIVE",
      ...(effectiveScope === "agency" ? {} : {
        id: { not: userId },
        modelAssignments: { some: { modelId: { in: assignedModels }, model: { isActive: true } } },
      }),
      roleMemberships: {
        // Agency/Owner totals exclude staff exempt from clocking in.
        none: { role: {
          archivedAt: null,
          ...(effectiveScope === "agency"
            ? { systemKey: { in: ["OWNER", "DEV", "MODEL"] } }
            : { OR: [
                { systemKey: { in: ["OWNER", "DEV", "MODEL", "OPS_MANAGER", "ACCOUNTANT", "GENERAL_STAFF"] } },
                { rank: { lte: highestRank! } },
              ] }),
        } },
        ...(effectiveScope === "agency" ? {} : {
          some: { role: {
            archivedAt: null,
            rank: { gt: highestRank! },
            ...(effectiveScope === "chatters" ? { systemKey: { in: ["CHATTER", "TRIAL_CHATTER"] } } : {}),
          } },
        }),
      },
    };
    const notClockedInStaff: Prisma.UserWhereInput = { AND: [workingStaff, { clockShifts: { none: { endedAt: null } } }] };
    const openStaffShift: Prisma.ClockShiftWhereInput = {
      endedAt: null,
      user: { is: workingStaff },
    };

    let cursor: { id: string; startedAt: Date } | null = null;
    if (before) {
      cursor = await tx.clockShift.findFirst({
        where: { AND: [openStaffShift, { id: before }] },
        select: { id: true, startedAt: true },
      });
      if (!cursor) {
        throw new ClockError(400, "The active shifts cursor is no longer available. Refresh the overview.");
      }
    }

    let offShiftCursor: { id: string; name: string } | null = null;
    if (offShiftBefore) {
      offShiftCursor = await tx.user.findFirst({
        where: { AND: [notClockedInStaff, { id: offShiftBefore }] },
        select: { id: true, name: true },
      });
      if (!offShiftCursor) throw new ClockError(400, "The staff roster has changed. Refresh the overview.");
    }
    const offShiftFilter: Prisma.UserWhereInput = offShiftCursor ? {
      OR: [
        { name: { gt: offShiftCursor.name } },
        { name: offShiftCursor.name, id: { gt: offShiftCursor.id } },
      ],
    } : {};
    const shiftSelect = {
      id: true,
      personName: true,
      startedAt: true,
      breaks: {
        where: { endedAt: null },
        orderBy: { startedAt: "desc" },
        take: 1,
        select: { kind: true, startedAt: true },
      },
      user: {
        select: { teamGroup: { select: { name: true } } },
      },
    } satisfies Prisma.ClockShiftSelect;
    const toShift = (row: Prisma.ClockShiftGetPayload<{ select: typeof shiftSelect }>) => ({
      id: row.id,
      personName: row.personName,
      teamName: row.user?.teamGroup?.name ?? "Unassigned",
      startedAt: row.startedAt,
      elapsedSeconds: elapsedSeconds(row.startedAt, now),
      activeBreak: row.breaks[0]
        ? { kind: row.breaks[0].kind, startedAt: row.breaks[0].startedAt }
        : null,
    });
    const longShiftStart = new Date(now.getTime() - LONG_SHIFT_MS);
    const firstPage = !before && !offShiftBefore;
    const rows = await tx.clockShift.findMany({
      where: {
        AND: [
          openStaffShift,
          ...(cursor ? [{
            OR: [
              { startedAt: { lt: cursor.startedAt } },
              { startedAt: cursor.startedAt, id: { lt: cursor.id } },
            ],
          }] : []),
        ],
      },
      select: shiftSelect,
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
    });

    const [offShiftRows, notClockedInCount, clockedInStaff, staffOnBreak, shiftsStartedToday, pendingReviewRequests, longShifts, longShiftRows, breakRows] = await Promise.all([
      tx.user.findMany({
        where: { AND: [notClockedInStaff, offShiftFilter] },
        select: { id: true, name: true, teamGroup: { select: { name: true } }, roleMemberships: { where: { role: { archivedAt: null } }, select: { role: { select: { name: true } } } } },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        take: PAGE_SIZE + 1,
      }),
      tx.user.count({ where: notClockedInStaff }),
      tx.clockShift.count({ where: openStaffShift }),
      tx.clockBreak.count({
        where: {
          endedAt: null,
          shift: { is: openStaffShift },
        },
      }),
      tx.clockShift.count({ where: { startDay: centralDayKey(now), user: { is: workingStaff } } }),
      isOwner && clockAllowed(viewer, "clock.corrections.all") && effectiveScope === "agency"
        ? tx.clockCorrection.count({
            where: { status: "PENDING", OR: [{ userId: { not: userId } }, { userId: null }] },
          })
        : Promise.resolve(0),
      // Shifts still open after 14 hours, counted across the whole roster
      // rather than only the first page of active shifts.
      tx.clockShift.count({
        where: { AND: [openStaffShift, { startedAt: { lte: longShiftStart } }] },
      }),
      // The longest shifts and breaks, wherever they fall in the roster.
      // Being the oldest, long shifts are usually past the first page.
      firstPage
        ? tx.clockShift.findMany({
            where: { AND: [openStaffShift, { startedAt: { lte: longShiftStart } }] },
            select: shiftSelect,
            orderBy: [{ startedAt: "asc" }, { id: "asc" }],
            take: ATTENTION_ROWS,
          })
        : Promise.resolve([]),
      firstPage
        ? tx.clockBreak.findMany({
            where: { endedAt: null, shift: { is: openStaffShift } },
            select: { shift: { select: shiftSelect } },
            orderBy: [{ startedAt: "asc" }, { id: "asc" }],
            take: ATTENTION_ROWS,
          })
        : Promise.resolve([]),
    ]);

    return {
      serverNow: now,
      timeZone: "America/Chicago",
      scope: effectiveScope,
      canReviewSummary: isOwner && clockAllowed(viewer, "clock.corrections.all") && effectiveScope === "agency",
      counts: {
        clockedInStaff,
        notClockedInStaff: notClockedInCount,
        staffOnBreak,
        shiftsStartedToday,
        pendingReviewRequests,
        longShifts,
      },
      activeShifts: rows.slice(0, PAGE_SIZE).map(toShift),
      // First page only: up to 5 long shifts (oldest first), then up to 5
      // shifts on a break (longest break first), without duplicates.
      attentionShifts: [...new Map(
        [...longShiftRows, ...breakRows.map((row) => row.shift)].map((row) => [row.id, toShift(row)]),
      ).values()],
      offShiftStaff: offShiftRows.slice(0, PAGE_SIZE).map((user) => ({
        id: user.id,
        personName: user.name,
        roleNames: user.roleMemberships.map(({ role }) => role.name).sort(),
        teamName: user.teamGroup?.name ?? "Unassigned",
      })),
      hasMoreOffShift: offShiftRows.length > PAGE_SIZE,
      nextOffShiftBefore: offShiftRows.length > PAGE_SIZE ? offShiftRows[PAGE_SIZE - 1].id : null,
      hasMore: rows.length > PAGE_SIZE,
      nextBefore: rows.length > PAGE_SIZE ? rows[PAGE_SIZE - 1].id : null,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15_000 });
}
export function getOwnerClockOverview(userId: string, before?: string, offShiftBefore?: string) {
  return readClockOverview(userId, before, offShiftBefore, true);
}
export function getAttendanceOverview(userId: string, before?: string, offShiftBefore?: string) {
  return readClockOverview(userId, before, offShiftBefore);
}
