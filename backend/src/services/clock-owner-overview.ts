import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { ClockError, clockAllowed, clockDatabaseNow, clockViewerInclude } from "./clock-policy.js";
import { centralDayKey, elapsedSeconds } from "./clock-time.js";

const PAGE_SIZE = 20;

/**
 * Owner-only agency attendance snapshot.
 *
 * This endpoint is deliberately separate from /clock/me: it never reuses
 * the requester's personal shifts as a proxy for agency-wide reporting.
 * The OWNER system role is checked against current non-archived role
 * memberships on every request, in addition to the active account and
 * clock permission checks.
 */
export async function getOwnerClockOverview(userId: string, before?: string) {
  return prisma.$transaction(async (tx) => {
    const viewer = await tx.user.findUnique({
      where: { id: userId },
      include: clockViewerInclude,
    });
    if (!viewer || viewer.status !== "ACTIVE") {
      throw new ClockError(401, "Please sign in again.");
    }
    const isOwner = viewer.roleMemberships.some(
      (membership) => membership.role.systemKey === "OWNER",
    );
    if (!isOwner || !clockAllowed(viewer, "clock.self.view") || !clockAllowed(viewer, "clock.corrections.all")) {
      throw new ClockError(403, "Only an active Owner can view agency attendance.");
    }

    const now = await clockDatabaseNow(tx);
    const workingStaff: Prisma.UserWhereInput = {
      status: "ACTIVE",
      // Exempt system roles never belong in the working-staff totals,
      // even if an old shift record remains open.
      roleMemberships: {
        none: {
          role: {
            archivedAt: null,
            systemKey: { in: ["OWNER", "DEV", "MODEL"] },
          },
        },
      },
    };
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
      select: {
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
      },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
    });

    const [clockedInStaff, staffOnBreak, shiftsStartedToday, pendingReviewRequests] = await Promise.all([
      tx.clockShift.count({ where: openStaffShift }),
      tx.clockBreak.count({
        where: {
          endedAt: null,
          shift: { is: openStaffShift },
        },
      }),
      tx.clockShift.count({ where: { startDay: centralDayKey(now), user: { is: workingStaff } } }),
      tx.clockCorrection.count({
        where: {
          status: "PENDING",
          OR: [{ userId: { not: userId } }, { userId: null }],
        },
      }),
    ]);

    return {
      serverNow: now,
      timeZone: "America/Chicago",
      counts: {
        clockedInStaff,
        staffOnBreak,
        shiftsStartedToday,
        pendingReviewRequests,
      },
      activeShifts: rows.slice(0, PAGE_SIZE).map((row) => ({
        id: row.id,
        personName: row.personName,
        teamName: row.user?.teamGroup?.name ?? "Unassigned",
        startedAt: row.startedAt,
        elapsedSeconds: elapsedSeconds(row.startedAt, now),
        activeBreak: row.breaks[0]
          ? { kind: row.breaks[0].kind, startedAt: row.breaks[0].startedAt }
          : null,
      })),
      hasMore: rows.length > PAGE_SIZE,
      nextBefore: rows.length > PAGE_SIZE ? rows[PAGE_SIZE - 1].id : null,
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15_000 });
}
