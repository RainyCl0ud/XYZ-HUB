import {
  ChatterStatus,
  Prisma,
  UserStatus,
} from "@prisma/client";

import {
  prisma,
} from "../lib/prisma.js";

const CHATTER_ROLE_KEYS = [
  "CHATTER",
  "TRIAL_CHATTER",
] as const;

function qaStatusForUser(
  status: UserStatus
) {
  return status ===
    UserStatus.DEACTIVATED
    ? ChatterStatus.INACTIVE
    : ChatterStatus.ACTIVE;
}

/**
 * Keep Login Gate People identities and QA Chatter profiles aligned.
 *
 * A user holding Chatter or Trial Chatter is a QA chatter even when no
 * incident has ever been logged for them. Their QA profile therefore must
 * not depend on Incident existence.
 *
 * Removing the chatter role does not delete history. Existing linked QA
 * profiles are retained and marked inactive so historical incident records
 * remain navigable.
 */
export async function reconcileQaChatterProfiles() {
  const [
    eligibleUsers,
    linkedProfiles,
  ] = await Promise.all([
    prisma.user.findMany({
      where: {
        roleMemberships: {
          some: {
            role: {
              systemKey: {
                in: [
                  ...CHATTER_ROLE_KEYS,
                ],
              },
            },
          },
        },
      },
      select: {
        id: true,
        name: true,
        status: true,
        chatterProfile: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
    }),

    prisma.chatter.findMany({
      where: {
        userId: {
          not: null,
        },
      },
      select: {
        id: true,
        userId: true,
      },
    }),
  ]);

  const eligibleUserIds =
    new Set(
      eligibleUsers.map(
        (user) =>
          user.id
      )
    );

  const operations:
    Prisma.PrismaPromise<unknown>[] =
    [];

  for (
    const user of
    eligibleUsers
  ) {
    const desiredStatus =
      qaStatusForUser(
        user.status
      );

    if (
      !user.chatterProfile
    ) {
      operations.push(
        prisma.chatter.create({
          data: {
            userId:
              user.id,
            name:
              user.name,
            status:
              desiredStatus,
          },
        })
      );

      continue;
    }

    if (
      user.chatterProfile.name !==
        user.name ||
      user.chatterProfile.status !==
        desiredStatus
    ) {
      operations.push(
        prisma.chatter.update({
          where: {
            id:
              user.chatterProfile.id,
          },
          data: {
            name:
              user.name,
            status:
              desiredStatus,
          },
        })
      );
    }
  }

  for (
    const profile of
    linkedProfiles
  ) {
    if (
      profile.userId &&
      !eligibleUserIds.has(
        profile.userId
      )
    ) {
      operations.push(
        prisma.chatter.update({
          where: {
            id:
              profile.id,
          },
          data: {
            status:
              ChatterStatus.INACTIVE,
          },
        })
      );
    }
  }

  if (
    operations.length >
    0
  ) {
    await prisma.$transaction(
      operations
    );
  }
}
