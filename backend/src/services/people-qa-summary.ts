import {
  prisma,
} from "../lib/prisma.js";

import {
  hasPermission,
  type AccessContext,
} from "./access-control.js";

import {
  getCurrentStrikeLadder,
} from "./strike-ladder.js";

import {
  listStrikeHistoryForUser,
} from "./strike-management.js";

import {
  reconcileQaChatterProfiles,
} from "./qa-chatter-profile-sync.js";

function incidentModelWhere(
  access: AccessContext
) {
  if (
    access.canSeeAllModels
  ) {
    return {};
  }

  return {
    modelId: {
      in:
        access.assignedModelIds,
    },
  };
}

export async function getPersonQaSummary(
  userId: string,
  access: AccessContext,
  historyPage = 1,
  historyPageSize = 5,
  strikeHistoryPage = 1,
  strikeHistoryPageSize = 5
) {
  await reconcileQaChatterProfiles();

  const chatter =
    await prisma.chatter.findUnique({
      where: {
        userId,
      },

      select: {
        id: true,
        userId: true,
        name: true,
        status: true,
      },
    });


  const safeHistoryPage =
    Math.max(
      1,
      Math.floor(
        historyPage
      )
    );

  const safeHistoryPageSize =
    Math.min(
      20,
      Math.max(
        1,
        Math.floor(
          historyPageSize
        )
      )
    );

  const safeStrikeHistoryPage =
    Math.max(
      1,
      Math.floor(
        strikeHistoryPage
      )
    );

  const safeStrikeHistoryPageSize =
    Math.min(
      20,
      Math.max(
        1,
        Math.floor(
          strikeHistoryPageSize
        )
      )
    );


  const now =
    new Date();

  const modelWhere =
    incidentModelWhere(
      access
    );

  const canViewStrikeHistory =
    hasPermission(
      access,
      "strikes.view"
    );

  const canViewQaHistory =
    hasPermission(
      access,
      "quality.incidents.view"
    );


  /*
   * Strike records belong to the employee identity, not to the
   * optional QA Chatter profile. An employee without QA linkage
   * must still get a correct Strike history/empty state.
   */
  const strikeLadder =
    canViewStrikeHistory
      ? await getCurrentStrikeLadder()
      : null;

  const activeStrikes =
    canViewStrikeHistory
      ? await prisma.strike.findMany({
          where: {
            userId,

            voidedAt:
              null,

            expiresAt: {
              gt:
                now,
            },
          },

          select: {
            expiresAt:
              true,
          },

          /*
           * This is intentionally ASC because it determines the
           * next upcoming expiry, not table/history ordering.
           */
          orderBy: [
            {
              expiresAt:
                "asc",
            },
            {
              id:
                "asc",
            },
          ],
        })
      : [];

  const disciplinaryHistory =
    canViewStrikeHistory
      ? await listStrikeHistoryForUser(
          userId,
          access,
          safeStrikeHistoryPage,
          safeStrikeHistoryPageSize
        )
      : null;


  /*
   * QA incidents genuinely depend on the QA Chatter link.
   */
  const recentIncidents =
    chatter &&
    canViewQaHistory
      ? await prisma.incident.findMany({
          where: {
            chatterId:
              chatter.id,

            ...modelWhere,
          },

          select: {
            id: true,

            ruleTitleSnapshot:
              true,

            severityNameSnapshot:
              true,

            weightNameSnapshot:
              true,

            weightValueSnapshot:
              true,

            occurredAt:
              true,

            status:
              true,
          },

          /*
           * Server-side pagination contract:
           * newest first, deterministic on equal timestamps.
           */
          orderBy: [
            {
              occurredAt:
                "desc",
            },
            {
              id:
                "desc",
            },
          ],

          skip:
            (safeHistoryPage - 1) *
            safeHistoryPageSize,

          take:
            safeHistoryPageSize,
        })
      : [];

  const totalIncidentCount =
    chatter &&
    canViewQaHistory
      ? await prisma.incident.count({
          where: {
            chatterId:
              chatter.id,

            ...modelWhere,
          },
        })
      : 0;


  const orderedSteps =
    strikeLadder
      ? [
          ...strikeLadder.steps,
        ].sort(
          (
            first,
            second
          ) =>
            first.minActiveStrikes -
            second.minActiveStrikes
        )
      : [];

  const activeStrikeCount =
    activeStrikes.length;

  let matchedStep =
    orderedSteps[0] ??
    null;

  for (
    const step of
    orderedSteps
  ) {
    if (
      step.minActiveStrikes <=
      activeStrikeCount
    ) {
      matchedStep =
        step;

      continue;
    }

    break;
  }


  return {
    /*
     * null means the employee genuinely has no QA profile.
     * It no longer makes the entire response disappear.
     */
    chatter,

    canViewQaHistory,

    canViewStrikeHistory,

    strikeSummary:
      strikeLadder
        ? {
            activeStrikeCount,

            standingLabel:
              matchedStep
                ?.standingLabel ??
              "Clear",

            deductionPercent:
              matchedStep
                ?.deductionPercent ??
              0,

            nextExpiryAt:
              activeStrikes[0]
                ?.expiresAt ??
              null,

            ladderVersionId:
              strikeLadder.id,

            ladderVersion:
              strikeLadder.versionNumber,
          }
        : null,

    disciplinaryHistory,

    recentIncidents,

    totalIncidentCount,

    historyPage:
      safeHistoryPage,

    historyPageSize:
      safeHistoryPageSize,

    historyPageCount:
      Math.max(
        1,
        Math.ceil(
          totalIncidentCount /
          safeHistoryPageSize
        )
      ),
  };
}
