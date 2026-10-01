import {
  prisma,
} from "../lib/prisma.js";

import type {
  AccessContext,
} from "./access-control.js";

import {
  getCurrentStrikeLadder,
  getStrikeActivityStatus,
} from "./strike-ladder.js";

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
  access: AccessContext
) {
  await reconcileQaChatterProfiles();

  const chatter =
    await prisma.chatter.findUnique({
      where: {
        userId,
      },
      select: {
        id: true,
        name: true,
        status: true,
      },
    });

  if (
    !chatter
  ) {
    return null;
  }

  const now =
    new Date();
  const modelWhere =
    incidentModelWhere(
      access
    );

  const [
    strikeLadder,
    activeStrikeIncidents,
    recentIncidents,
    totalIncidentCount,
  ] = await Promise.all([
    getCurrentStrikeLadder(),

    prisma.incident.findMany({
      where: {
        chatterId:
          chatter.id,
        ...modelWhere,
        status: {
          not:
            "VOIDED",
        },
        expiresAt: {
          gt:
            now,
        },
      },
      select: {
        expiresAt: true,
      },
      orderBy: {
        expiresAt:
          "asc",
      },
    }),

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
        expiresAt: true,
        status: true,
      },
      orderBy: {
        occurredAt:
          "desc",
      },
      take: 5,
    }),

    prisma.incident.count({
      where: {
        chatterId:
          chatter.id,
        ...modelWhere,
      },
    }),
  ]);

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
    activeStrikeIncidents.length;

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
        activeStrikeIncidents[0]
          ?.expiresAt ??
        null,
      ladderVersionId:
        strikeLadder.id,
      ladderVersion:
        strikeLadder.versionNumber,
    },
    recentIncidents:
      recentIncidents.map(
        (incident) => ({
          ...incident,
          strikeActivityStatus:
            getStrikeActivityStatus(
              incident
            ),
        })
      ),
    totalIncidentCount,
  };
}
