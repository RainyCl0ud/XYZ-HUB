import {
  Prisma,
} from "@prisma/client";

import {
  prisma,
} from "../lib/prisma.js";

/*
 * =========================================================
 * TYPES
 * =========================================================
 */

export type IncidentWorkflowStatus =
  | "OPEN"
  | "RESOLVED"
  | "VOIDED";

export type StrikeActivityStatus =
  | "ACTIVE"
  | "EXPIRED"
  | "NOT_APPLICABLE";

export type StrikeLadderStepValue = {
  minActiveStrikes: number;
  standingLabel: string;
  deductionPercent: number;
};

export type StrikeLadderState = {
  activeStrikeCount: number;

  appliedThreshold: number;

  standingLabel: string;

  commissionDeductionPercent: number;
};

/*
 * =========================================================
 * DEFAULT CONFIGURATION
 * =========================================================
 *
 * This is used only when the database does not yet contain
 * a ladder configuration.
 *
 * Once initialized, management configuration comes from
 * PostgreSQL rather than these constants.
 */

export const DEFAULT_STRIKE_DURATION_DAYS =
  30;

export const DEFAULT_STRIKE_LADDER_STEPS:
  StrikeLadderStepValue[] = [
    {
      minActiveStrikes: 0,
      standingLabel:
        "Clear",
      deductionPercent: 0,
    },

    {
      minActiveStrikes: 1,
      standingLabel:
        "Formal Warning",
      deductionPercent: 0,
    },

    {
      minActiveStrikes: 2,
      standingLabel:
        "20% Commission Cut",
      deductionPercent: 20,
    },

    {
      minActiveStrikes: 3,
      standingLabel:
        "Final Warning / 30% Cut",
      deductionPercent: 30,
    },

    {
      minActiveStrikes: 4,
      standingLabel:
        "Termination Review",
      deductionPercent: 30,
    },
  ];

/*
 * =========================================================
 * STRIKE ACTIVITY
 * =========================================================
 */

export function getStrikeActivityStatus(
  incident: {
    status:
      IncidentWorkflowStatus;

    expiresAt: Date;
  },
  now = new Date()
): StrikeActivityStatus {
  /*
   * Voiding invalidates the strike.
   *
   * It remains historically visible,
   * but it must never count toward the
   * current strike ladder.
   */
  if (
    incident.status ===
    "VOIDED"
  ) {
    return "NOT_APPLICABLE";
  }

  /*
   * OPEN and RESOLVED incidents both
   * continue to count until their own
   * stored expiration timestamp.
   */
  if (
    incident.expiresAt.getTime() <=
    now.getTime()
  ) {
    return "EXPIRED";
  }

  return "ACTIVE";
}

/*
 * =========================================================
 * EXPIRY CALCULATION
 * =========================================================
 */

export function calculateExpiryDate(
  occurredAt: Date,
  durationDays: number
): Date {
  if (
    !Number.isInteger(
      durationDays
    ) ||
    durationDays < 1
  ) {
    throw new Error(
      "Strike duration must be a positive whole number"
    );
  }

  return new Date(
    occurredAt.getTime() +
      durationDays *
        24 *
        60 *
        60 *
        1000
  );
}

/*
 * =========================================================
 * LADDER CALCULATION
 * =========================================================
 *
 * The highest configured threshold that is less than or
 * equal to the active strike count is the applicable step.
 *
 * Example configuration:
 *
 * 0 → Clear
 * 1 → Warning
 * 2 → 20%
 * 3 → 30%
 * 4 → Termination Review
 *
 * Active count of 7 therefore uses threshold 4.
 */

export function getStrikeLadderState(
  activeStrikeCount: number,
  steps:
    StrikeLadderStepValue[]
): StrikeLadderState {
  if (
    !Number.isInteger(
      activeStrikeCount
    ) ||
    activeStrikeCount < 0
  ) {
    throw new Error(
      "Active strike count cannot be negative"
    );
  }

  if (steps.length === 0) {
    throw new Error(
      "Strike ladder has no configured steps"
    );
  }

  const orderedSteps = [
    ...steps,
  ].sort(
    (first, second) =>
      first.minActiveStrikes -
      second.minActiveStrikes
  );

  if (
    orderedSteps[0]
      .minActiveStrikes !== 0
  ) {
    throw new Error(
      "Strike ladder must contain a threshold starting at 0 active strikes"
    );
  }

  let applicableStep =
    orderedSteps[0];

  for (
    const step of orderedSteps
  ) {
    if (
      step.minActiveStrikes <=
      activeStrikeCount
    ) {
      applicableStep =
        step;

      continue;
    }

    break;
  }

  return {
    activeStrikeCount,

    appliedThreshold:
      applicableStep
        .minActiveStrikes,

    standingLabel:
      applicableStep
        .standingLabel,

    commissionDeductionPercent:
      applicableStep
        .deductionPercent,
  };
}

/*
 * =========================================================
 * CURRENT LADDER INITIALIZATION
 * =========================================================
 *
 * A brand-new database does not contain a ladder yet.
 *
 * The first request automatically creates v1 using the
 * default policy above. From that point forward, the
 * database becomes the source of truth.
 *
 * This avoids hardcoding the live ladder into the app.
 */

async function createInitialLadder() {
  return prisma.$transaction(
    async (tx) => {
      /*
       * Re-check inside the transaction in case another
       * request initialized the ladder moments earlier.
       */
      const existingCurrent =
        await tx.strikeLadderVersion.findFirst(
          {
            where: {
              isCurrent: true,
            },

            include: {
              steps: {
                orderBy: {
                  minActiveStrikes:
                    "asc",
                },
              },
            },

            orderBy: {
              versionNumber:
                "desc",
            },
          }
        );

      if (existingCurrent) {
        return existingCurrent;
      }

      /*
       * If versions somehow already exist but none are
       * flagged current, recover by using the latest one
       * rather than creating duplicate version numbers.
       */
      const latestExisting =
        await tx.strikeLadderVersion.findFirst(
          {
            include: {
              steps: {
                orderBy: {
                  minActiveStrikes:
                    "asc",
                },
              },
            },

            orderBy: {
              versionNumber:
                "desc",
            },
          }
        );

      if (latestExisting) {
        return tx.strikeLadderVersion.update(
          {
            where: {
              id:
                latestExisting.id,
            },

            data: {
              isCurrent: true,
            },

            include: {
              steps: {
                orderBy: {
                  minActiveStrikes:
                    "asc",
                },
              },
            },
          }
        );
      }

      return tx.strikeLadderVersion.create(
        {
          data: {
            versionNumber: 1,

            durationDays:
              DEFAULT_STRIKE_DURATION_DAYS,

            isCurrent: true,

            steps: {
              create:
                DEFAULT_STRIKE_LADDER_STEPS.map(
                  (step) => ({
                    minActiveStrikes:
                      step.minActiveStrikes,

                    standingLabel:
                      step.standingLabel,

                    deductionPercent:
                      step.deductionPercent,
                  })
                ),
            },
          },

          include: {
            steps: {
              orderBy: {
                minActiveStrikes:
                  "asc",
              },
            },
          },
        }
      );
    },
    {
      isolationLevel:
        Prisma.TransactionIsolationLevel
          .Serializable,
    }
  );
}

export async function getCurrentStrikeLadder() {
  const existing =
    await prisma.strikeLadderVersion.findFirst(
      {
        where: {
          isCurrent: true,
        },

        include: {
          steps: {
            orderBy: {
              minActiveStrikes:
                "asc",
            },
          },
        },

        orderBy: {
          versionNumber:
            "desc",
        },
      }
    );

  if (existing) {
    return existing;
  }

  /*
   * Initialization normally happens only once.
   *
   * P2002 can occur if two first-time requests attempt
   * to create version 1 simultaneously.
   *
   * P2034 can occur when PostgreSQL detects a serializable
   * transaction conflict.
   */
  try {
    return await createInitialLadder();
  } catch (error) {
    if (
      error instanceof
        Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" ||
        error.code === "P2034")
    ) {
      const recovered =
        await prisma.strikeLadderVersion.findFirst(
          {
            where: {
              isCurrent:
                true,
            },

            include: {
              steps: {
                orderBy: {
                  minActiveStrikes:
                    "asc",
                },
              },
            },

            orderBy: {
              versionNumber:
                "desc",
            },
          }
        );

      if (recovered) {
        return recovered;
      }
    }

    throw error;
  }
}