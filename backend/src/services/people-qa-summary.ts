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

  if (
    !chatter
  ) {
    return null;
  }

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

  const [
    strikeLadder,
    activeStrikes,
    disciplinaryHistory,
    recentIncidents,
    totalIncidentCount,
  ] = await Promise.all([
    getCurrentStrikeLadder(),

    chatter.userId
      ? prisma.strike.findMany({
          where: {
            userId:
              chatter.userId,

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

          orderBy: {
            expiresAt:
              "asc",
          },
        })
      : Promise.resolve([] as { expiresAt: Date }[]),

    chatter.userId &&
    hasPermission(
      access,
      "strikes.view"
    )
      ? listStrikeHistoryForUser(
          chatter.userId,
          access,
          safeStrikeHistoryPage,
          safeStrikeHistoryPageSize
        )
      : Promise.resolve(
          null
        ),

    prisma.incident.findMany({
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
        occurredAt: true,
        status: true,
      },
      orderBy: {
        occurredAt:
          "desc",
      },
      skip:
        (safeHistoryPage - 1) *
        safeHistoryPageSize,
      take:
        safeHistoryPageSize,
    }),

    prisma.incident.count({
      where: {
        chatterId:
          chatter.id,
        ...modelWhere,
      },
    }),
  ]);

  const activeStrikeRows =
    activeStrikes as
      Array<{
        expiresAt:
          Date;
      }>;

  const orderedSteps =
    [...strikeLadder.steps].sort(
      (
        first,
        second
      ) =>
        first.minActiveStrikes -
        second.minActiveStrikes
    );

  const activeStrikeCount =
    activeStrikeRows.length;

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
    chatter,
    strikeSummary: {
      activeStrikeCount,
      standingLabel:
        matchedStep?.standingLabel ??
        "Clear",
      deductionPercent:
        matchedStep?.deductionPercent ??
        0,
      nextExpiryAt:
        activeStrikeRows[0]
          ?.expiresAt ??
        null,
      ladderVersionId:
        strikeLadder.id,
      ladderVersion:
        strikeLadder.versionNumber,
    },
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
