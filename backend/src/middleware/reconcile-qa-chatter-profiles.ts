import {
  ChatterStatus,
  UserStatus,
} from "@prisma/client";

import type {
  NextFunction,
  Request,
  Response,
} from "express";

import {
  prisma,
} from "../lib/prisma.js";

const QA_CHATTER_ROLE_KEYS = [
  "CHATTER",
  "TRIAL_CHATTER",
];

/**
 * Transitional identity bridge for the existing QA Chatter table.
 *
 * Login Gate / People Management is now the authority for whether a
 * person is a Chatter. Older code created UserRole records separately
 * from QA Chatter records, which meant a newly assigned Chatter could be
 * missing from QA until an incident/profile record was manually added.
 *
 * This reconciliation runs only when the Chatter collection is read. It
 * preserves incident history, links an unambiguous legacy record when
 * possible, creates a profile when none exists, and marks linked profiles
 * inactive when the person no longer has a Chatter role.
 */
async function reconcileQaChatterProfiles() {
  const users =
    await prisma.user.findMany({
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
        roleMemberships: {
          select: {
            role: {
              select: {
                systemKey: true,
              },
            },
          },
        },
      },
    });

  const operations = [];

  for (const user of users) {
    const isQaChatter =
      user.roleMemberships.some(
        (membership) =>
          membership.role.systemKey !== null &&
          QA_CHATTER_ROLE_KEYS.includes(
            membership.role.systemKey
          )
      );

    const desiredStatus =
      isQaChatter &&
      user.status === UserStatus.ACTIVE
        ? ChatterStatus.ACTIVE
        : ChatterStatus.INACTIVE;

    if (user.chatterProfile) {
      if (
        user.chatterProfile.name !== user.name ||
        user.chatterProfile.status !== desiredStatus
      ) {
        operations.push(
          prisma.chatter.update({
            where: {
              id: user.chatterProfile.id,
            },
            data: {
              name: user.name,
              status: desiredStatus,
            },
          })
        );
      }

      continue;
    }

    if (!isQaChatter) {
      continue;
    }

    /*
     * Prefer an exact unlinked legacy profile only when the match is
     * unambiguous. Otherwise create a new linked identity rather than
     * attaching the wrong historical incident record to this person.
     */
    const legacyMatches =
      await prisma.chatter.findMany({
        where: {
          userId: null,
          name: {
            equals: user.name,
            mode: "insensitive",
          },
        },
        select: {
          id: true,
        },
        take: 2,
      });

    if (legacyMatches.length === 1) {
      operations.push(
        prisma.chatter.update({
          where: {
            id: legacyMatches[0].id,
          },
          data: {
            userId: user.id,
            name: user.name,
            status: desiredStatus,
          },
        })
      );
    } else {
      operations.push(
        prisma.chatter.create({
          data: {
            userId: user.id,
            name: user.name,
            status: desiredStatus,
          },
        })
      );
    }
  }

  if (operations.length > 0) {
    await prisma.$transaction(
      operations
    );
  }
}

export async function reconcileQaChatterProfilesMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  /* Only collection reads need to repair identity visibility. */
  if (
    req.method !== "GET" ||
    req.path !== "/"
  ) {
    next();
    return;
  }

  try {
    await reconcileQaChatterProfiles();
    next();
  } catch (error) {
    console.error(
      "Unable to reconcile QA chatter profiles:",
      error
    );

    res.status(500).json({
      error: "CHATTER_RECONCILIATION_FAILED",
      message:
        "Unable to synchronize People Management chatter identities with QA.",
    });
  }
}
