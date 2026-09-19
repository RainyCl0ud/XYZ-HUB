import {
  Prisma,
} from "@prisma/client";

import {
  Router,
} from "express";

import {
  z,
} from "zod";

import {
  prisma,
} from "../lib/prisma.js";

import {
  getCurrentStrikeLadder,
} from "../services/strike-ladder.js";

const router = Router();

/*
 * =========================================================
 * VALIDATION
 * =========================================================
 */

const ladderStepSchema =
  z.object({
    /*
     * Active-strike numbering is intentionally NOT accepted
     * from management. Array position determines the threshold:
     *
     * first step  → 0 strikes
     * second step → 1 strike
     * third step  → 2 strikes
     *
     * Zod strips unknown fields, so even if a client attempts
     * to send minActiveStrikes manually, it is ignored.
     */
    standingLabel:
      z
        .string()
        .trim()
        .min(
          1,
          "Standing label is required"
        )
        .max(
          120,
          "Standing label must be 120 characters or fewer"
        ),

    deductionPercent:
      z
        .number()
        .finite(
          "Deduction percentage must be a valid number"
        )
        .min(
          0,
          "Deduction percentage cannot be negative"
        )
        .max(
          100,
          "Deduction percentage cannot exceed 100%"
        ),
  });

const ladderConfigurationSchema =
  z
    .object({
      durationDays:
        z
          .number()
          .int(
            "Strike duration must be a whole number of days"
          )
          .min(
            1,
            "Strike duration must be at least 1 day"
          )
          .max(
            365,
            "Strike duration cannot exceed 365 days"
          ),

      /*
       * At least one step is required because index 0 is the
       * permanent base/default strike state.
       */
      steps:
        z
          .array(
            ladderStepSchema
          )
          .min(
            1,
            "The 0-strike base step is required"
          )
          .max(
            50,
            "Strike ladder cannot contain more than 50 steps"
          ),
    })
    .superRefine(
      (value, context) => {
        /*
         * 0 active strikes is always the default/base state.
         * Its commission deduction is a protected 0%.
         */
        if (
          value.steps[0] &&
          value.steps[0]
            .deductionPercent !== 0
        ) {
          context.addIssue({
            code:
              z.ZodIssueCode.custom,

            path: [
              "steps",
              0,
              "deductionPercent",
            ],

            message:
              "The 0-strike base step must always have a 0% deduction",
          });
        }
      }
    );

/*
 * =========================================================
 * HELPERS
 * =========================================================
 */

type LadderPayload =
  z.infer<
    typeof ladderConfigurationSchema
  >;

type SequentialLadderPayload = {
  durationDays: number;

  steps: Array<{
    minActiveStrikes: number;
    standingLabel: string;
    deductionPercent: number;
  }>;
};

function buildSequentialSteps(
  steps:
    LadderPayload["steps"]
): SequentialLadderPayload["steps"] {
  /*
   * Thresholds are system controlled.
   *
   * Removing a row from the management UI simply shortens
   * this array, so the remaining steps are automatically
   * renumbered 0, 1, 2, 3... on the next saved version.
   */
  return steps.map(
    (step, index) => ({
      minActiveStrikes:
        index,

      standingLabel:
        step.standingLabel.trim(),

      deductionPercent:
        index === 0
          ? 0
          : step.deductionPercent,
    })
  );
}

function sameConfiguration(
  current: {
    durationDays: number;

    steps: Array<{
      minActiveStrikes:
        number;

      standingLabel:
        string;

      deductionPercent:
        number;
    }>;
  },

  submitted:
    SequentialLadderPayload
) {
  if (
    current.durationDays !==
    submitted.durationDays
  ) {
    return false;
  }

  const currentSteps =
    [...current.steps].sort(
      (first, second) =>
        first.minActiveStrikes -
        second.minActiveStrikes
    );

  if (
    currentSteps.length !==
    submitted.steps.length
  ) {
    return false;
  }

  return currentSteps.every(
    (currentStep, index) => {
      const submittedStep =
        submitted.steps[index];

      return (
        currentStep
          .minActiveStrikes ===
          submittedStep
            .minActiveStrikes &&
        currentStep
          .standingLabel
          .trim() ===
          submittedStep
            .standingLabel &&
        currentStep
          .deductionPercent ===
          submittedStep
            .deductionPercent
      );
    }
  );
}

/*
 * =========================================================
 * GET CURRENT CONFIGURATION
 * =========================================================
 */

// GET /api/strike-ladder
router.get(
  "/",
  async (_req, res) => {
    try {
      const ladder =
        await getCurrentStrikeLadder();

      res.status(200).json({
        data: ladder,
      });
    } catch (error) {
      console.error(
        "Failed to fetch current strike ladder:",
        error
      );

      res.status(500).json({
        message:
          "Failed to fetch strike ladder configuration",
      });
    }
  }
);

/*
 * =========================================================
 * GET VERSION HISTORY
 * =========================================================
 */

// GET /api/strike-ladder/history
router.get(
  "/history",
  async (_req, res) => {
    try {
      /*
       * Ensure v1 exists before returning history.
       */
      await getCurrentStrikeLadder();

      const versions =
        await prisma.strikeLadderVersion.findMany(
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

      res.status(200).json({
        data: versions,
      });
    } catch (error) {
      console.error(
        "Failed to fetch strike ladder history:",
        error
      );

      res.status(500).json({
        message:
          "Failed to fetch strike ladder history",
      });
    }
  }
);

/*
 * =========================================================
 * GET ONE VERSION
 * =========================================================
 */

// GET /api/strike-ladder/:id
router.get(
  "/:id",
  async (req, res) => {
    try {
      const version =
        await prisma.strikeLadderVersion.findUnique(
          {
            where: {
              id:
                req.params.id,
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

      if (!version) {
        res.status(404).json({
          message:
            "Strike ladder version not found",
        });

        return;
      }

      res.status(200).json({
        data: version,
      });
    } catch (error) {
      console.error(
        "Failed to fetch strike ladder version:",
        error
      );

      res.status(500).json({
        message:
          "Failed to fetch strike ladder version",
      });
    }
  }
);

/*
 * =========================================================
 * CREATE NEW LADDER VERSION
 * =========================================================
 *
 * Existing versions are never edited or deleted.
 *
 * When management saves changes:
 *
 * current version → historical
 * new version     → current
 *
 * Later, authentication middleware can protect this route
 * without changing the ladder architecture.
 */

// POST /api/strike-ladder
router.post(
  "/",
  async (req, res) => {
    const validation =
      ladderConfigurationSchema.safeParse(
        req.body
      );

    if (
      !validation.success
    ) {
      res.status(400).json({
        message:
          "Invalid strike ladder configuration",

        errors:
          validation.error.flatten(),
      });

      return;
    }

    const payload:
      SequentialLadderPayload = {
      durationDays:
        validation.data
          .durationDays,

      /*
       * Management controls labels and deductions.
       * The backend controls the actual strike numbers.
       */
      steps:
        buildSequentialSteps(
          validation.data.steps
        ),
    };

    /*
     * Retry serializable conflicts or simultaneous
     * attempts to create the same version number.
     */
    const MAX_ATTEMPTS = 3;

    for (
      let attempt = 1;
      attempt <=
      MAX_ATTEMPTS;
      attempt += 1
    ) {
      try {
        const result =
          await prisma.$transaction(
            async (tx) => {
              const current =
                await tx.strikeLadderVersion.findFirst(
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

              /*
               * This normally initializes v1 before an
               * administrator can reach this POST route,
               * but this keeps the route safe even if the
               * POST happens first.
               */
              if (!current) {
                throw new Error(
                  "CURRENT_LADDER_MISSING"
                );
              }

              if (
                sameConfiguration(
                  current,
                  payload
                )
              ) {
                return {
                  created: false,

                  ladder:
                    current,
                };
              }

              const latest =
                await tx.strikeLadderVersion.aggregate(
                  {
                    _max: {
                      versionNumber:
                        true,
                    },
                  }
                );

              const nextVersionNumber =
                (latest._max
                  .versionNumber ??
                  0) + 1;

              /*
               * There should only ever be one current
               * configuration.
               */
              await tx.strikeLadderVersion.updateMany(
                {
                  where: {
                    isCurrent:
                      true,
                  },

                  data: {
                    isCurrent:
                      false,
                  },
                }
              );

              const created =
                await tx.strikeLadderVersion.create(
                  {
                    data: {
                      versionNumber:
                        nextVersionNumber,

                      durationDays:
                        payload.durationDays,

                      isCurrent:
                        true,

                      steps: {
                        create:
                          payload.steps.map(
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

              return {
                created: true,

                ladder:
                  created,
              };
            },
            {
              isolationLevel:
                Prisma
                  .TransactionIsolationLevel
                  .Serializable,
            }
          );

        if (!result.created) {
          res.status(200).json({
            message:
              "No strike ladder changes were detected",

            data:
              result.ladder,
          });

          return;
        }

        res.status(201).json({
          message:
            "Strike ladder configuration updated successfully",

          data:
            result.ladder,
        });

        return;
      } catch (error) {
        if (
          error instanceof Error &&
          error.message ===
            "CURRENT_LADDER_MISSING"
        ) {
          /*
           * Initialize v1, then allow the request to
           * retry using that current configuration.
           */
          try {
            await getCurrentStrikeLadder();
          } catch (
            initializationError
          ) {
            console.error(
              "Failed to initialize strike ladder:",
              initializationError
            );

            res.status(500).json({
              message:
                "Failed to initialize strike ladder configuration",
            });

            return;
          }

          continue;
        }

        const retryable =
          error instanceof
            Prisma.PrismaClientKnownRequestError &&
          (error.code ===
            "P2002" ||
            error.code ===
              "P2034");

        if (
          retryable &&
          attempt <
            MAX_ATTEMPTS
        ) {
          continue;
        }

        console.error(
          "Failed to update strike ladder:",
          error
        );

        res.status(500).json({
          message:
            "Failed to update strike ladder configuration",
        });

        return;
      }
    }

    res.status(500).json({
      message:
        "Failed to update strike ladder configuration",
    });
  }
);

export default router;