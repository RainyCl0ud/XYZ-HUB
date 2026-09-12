import { Prisma } from "@prisma/client";
import { Router } from "express";
import type { Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

const router = Router();

const ruleSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Rule title is required")
    .max(
      150,
      "Rule title must be 150 characters or fewer"
    ),

  definition: z
    .string()
    .trim()
    .min(1, "Rule definition is required")
    .max(
      2000,
      "Rule definition must be 2000 characters or fewer"
    ),

  severityOptionId: z
    .string()
    .trim()
    .min(1)
    .nullable()
    .optional(),

  weightOptionId: z
    .string()
    .trim()
    .min(1)
    .nullable()
    .optional(),
});

type ComparableRuleInput = {
  title: string;
  definition: string;
  severityOptionId: string | null;
  weightOptionId: string | null;
};

/*
 * Duplicate comparisons should not be defeated by:
 *
 * "Left Hanging"
 * " left hanging "
 * "LEFT   HANGING"
 *
 * Extra whitespace and capitalization are ignored.
 *
 * Punctuation and actual wording changes still count as
 * meaningful differences.
 */
function normalizeRuleText(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

function sameRuleInput(
  first: ComparableRuleInput,
  second: ComparableRuleInput
) {
  return (
    normalizeRuleText(first.title) ===
      normalizeRuleText(second.title) &&
    normalizeRuleText(first.definition) ===
      normalizeRuleText(second.definition) &&
    first.severityOptionId ===
      second.severityOptionId &&
    first.weightOptionId ===
      second.weightOptionId
  );
}

/*
 * Used internally when another logical rule already
 * contains exactly the same configuration.
 */
class IdenticalRuleError extends Error {
  duplicateRuleId: string;
  duplicateIsActive: boolean;

  constructor(
    duplicateRuleId: string,
    duplicateIsActive: boolean
  ) {
    super("IDENTICAL_RULE_EXISTS");

    this.name = "IdenticalRuleError";
    this.duplicateRuleId = duplicateRuleId;
    this.duplicateIsActive =
      duplicateIsActive;
  }
}

/*
 * Search the latest version of every OTHER rule.
 *
 * Archived rules are intentionally included.
 *
 * If an identical archived rule exists, management
 * should reactivate that record rather than create
 * another duplicate logical rule.
 */
async function findIdenticalRule(
  tx: Prisma.TransactionClient,
  input: ComparableRuleInput,
  excludeRuleId?: string
) {
  const candidates =
    await tx.rule.findMany({
      where: excludeRuleId
        ? {
            id: {
              not: excludeRuleId,
            },
          }
        : undefined,

      select: {
        id: true,
        isActive: true,

        versions: {
          orderBy: {
            versionNumber: "desc",
          },

          take: 1,

          select: {
            title: true,
            definition: true,
            severityOptionId: true,
            weightOptionId: true,
          },
        },
      },
    });

  for (const candidate of candidates) {
    const latestVersion =
      candidate.versions[0];

    if (!latestVersion) {
      continue;
    }

    const candidateInput: ComparableRuleInput =
      {
        title: latestVersion.title,

        definition:
          latestVersion.definition,

        severityOptionId:
          latestVersion.severityOptionId,

        weightOptionId:
          latestVersion.weightOptionId,
      };

    if (
      sameRuleInput(
        candidateInput,
        input
      )
    ) {
      return {
        id: candidate.id,
        isActive: candidate.isActive,
      };
    }
  }

  return null;
}

function sendIdenticalRuleResponse(
  error: IdenticalRuleError,
  res: Response
) {
  if (error.duplicateIsActive) {
    res.status(409).json({
      message:
        "An identical rule already exists.",

      duplicateRuleId:
        error.duplicateRuleId,
    });

    return;
  }

  res.status(409).json({
    message:
      "An identical archived rule already exists. Reactivate the existing rule instead.",

    duplicateRuleId:
      error.duplicateRuleId,
  });
}

async function resolveSeverityOption(
  id?: string | null
) {
  if (!id) {
    return null;
  }

  const option =
    await prisma.severityOption.findUnique({
      where: {
        id,
      },
    });

  if (!option) {
    throw new Error(
      "SEVERITY_NOT_FOUND"
    );
  }

  if (!option.isActive) {
    throw new Error(
      "SEVERITY_INACTIVE"
    );
  }

  return option;
}

async function resolveWeightOption(
  id?: string | null
) {
  if (!id) {
    return null;
  }

  const option =
    await prisma.weightOption.findUnique({
      where: {
        id,
      },
    });

  if (!option) {
    throw new Error(
      "WEIGHT_NOT_FOUND"
    );
  }

  if (!option.isActive) {
    throw new Error(
      "WEIGHT_INACTIVE"
    );
  }

  return option;
}

function handleRuleOptionError(
  error: unknown,
  res: Response
): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  switch (error.message) {
    case "SEVERITY_NOT_FOUND":
      res.status(400).json({
        message:
          "Selected severity option does not exist",
      });

      return true;

    case "SEVERITY_INACTIVE":
      res.status(400).json({
        message:
          "Selected severity option is archived",
      });

      return true;

    case "WEIGHT_NOT_FOUND":
      res.status(400).json({
        message:
          "Selected weight option does not exist",
      });

      return true;

    case "WEIGHT_INACTIVE":
      res.status(400).json({
        message:
          "Selected weight option is archived",
      });

      return true;

    default:
      return false;
  }
}

function isPrismaErrorCode(
  error: unknown,
  code: string
) {
  return (
    error instanceof
      Prisma.PrismaClientKnownRequestError &&
    error.code === code
  );
}

/*
 * =========================
 * GET RULES
 * =========================
 */

// GET /api/rules
router.get("/", async (req, res) => {
  try {
    const isActive =
      req.query.active === "true"
        ? true
        : req.query.active === "false"
          ? false
          : undefined;

    const rules =
      await prisma.rule.findMany({
        where:
          isActive === undefined
            ? undefined
            : {
                isActive,
              },

        include: {
          versions: {
            orderBy: {
              versionNumber: "desc",
            },

            take: 1,
          },
        },

        orderBy: {
          createdAt: "desc",
        },
      });

    const data = rules.map(
      (rule) => ({
        ...rule,

        currentVersion:
          rule.versions[0] ?? null,

        versions: undefined,
      })
    );

    res.status(200).json({
      data,
    });
  } catch (error) {
    console.error(
      "Failed to fetch rules:",
      error
    );

    res.status(500).json({
      message:
        "Failed to fetch rules",
    });
  }
});

/*
 * =========================
 * GET ONE RULE
 * =========================
 */

// GET /api/rules/:id
router.get("/:id", async (req, res) => {
  try {
    const rule =
      await prisma.rule.findUnique({
        where: {
          id: req.params.id,
        },

        include: {
          versions: {
            orderBy: {
              versionNumber: "desc",
            },

            include: {
              severityOption: true,
              weightOption: true,
            },
          },
        },
      });

    if (!rule) {
      res.status(404).json({
        message: "Rule not found",
      });

      return;
    }

    res.status(200).json({
      data: {
        ...rule,

        currentVersion:
          rule.versions[0] ?? null,
      },
    });
  } catch (error) {
    console.error(
      "Failed to fetch rule:",
      error
    );

    res.status(500).json({
      message:
        "Failed to fetch rule",
    });
  }
});

/*
 * =========================
 * CREATE RULE
 * =========================
 */

// POST /api/rules
router.post("/", async (req, res) => {
  try {
    const result =
      ruleSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        message:
          "Invalid rule data",

        errors:
          result.error.flatten()
            .fieldErrors,
      });

      return;
    }

    const severityOption =
      await resolveSeverityOption(
        result.data.severityOptionId
      );

    const weightOption =
      await resolveWeightOption(
        result.data.weightOptionId
      );

    const comparableInput: ComparableRuleInput =
      {
        title: result.data.title,

        definition:
          result.data.definition,

        severityOptionId:
          severityOption?.id ?? null,

        weightOptionId:
          weightOption?.id ?? null,
      };

    /*
     * Serializable transaction protects against
     * two near-simultaneous requests both trying
     * to create the same logical rule.
     */
    const MAX_CREATE_ATTEMPTS = 3;

    for (
      let attempt = 1;
      attempt <=
      MAX_CREATE_ATTEMPTS;
      attempt += 1
    ) {
      try {
        const created =
          await prisma.$transaction(
            async (tx) => {
              const duplicate =
                await findIdenticalRule(
                  tx,
                  comparableInput
                );

              if (duplicate) {
                throw new IdenticalRuleError(
                  duplicate.id,
                  duplicate.isActive
                );
              }

              const rule =
                await tx.rule.create({
                  data: {},
                });

              const version =
                await tx.ruleVersion.create(
                  {
                    data: {
                      ruleId: rule.id,

                      versionNumber: 1,

                      title:
                        result.data.title,

                      definition:
                        result.data
                          .definition,

                      severityOptionId:
                        severityOption?.id ??
                        null,

                      weightOptionId:
                        weightOption?.id ??
                        null,

                      severityNameSnapshot:
                        severityOption?.name ??
                        null,

                      weightNameSnapshot:
                        weightOption?.name ??
                        null,

                      weightValueSnapshot:
                        weightOption?.value ??
                        null,
                    },
                  }
                );

              return {
                rule,
                version,
              };
            },
            {
              isolationLevel:
                Prisma
                  .TransactionIsolationLevel
                  .Serializable,
            }
          );

        res.status(201).json({
          message:
            "Rule created successfully",

          data: {
            ...created.rule,

            currentVersion:
              created.version,
          },
        });

        return;
      } catch (error) {
        if (
          error instanceof
          IdenticalRuleError
        ) {
          sendIdenticalRuleResponse(
            error,
            res
          );

          return;
        }

        /*
         * P2034 can occur when a serializable
         * transaction needs to be retried.
         */
        if (
          isPrismaErrorCode(
            error,
            "P2034"
          ) &&
          attempt <
            MAX_CREATE_ATTEMPTS
        ) {
          continue;
        }

        throw error;
      }
    }

    res.status(409).json({
      message:
        "The rule could not be created because another request changed the rule data. Please try again.",
    });
  } catch (error) {
    if (
      handleRuleOptionError(
        error,
        res
      )
    ) {
      return;
    }

    console.error(
      "Failed to create rule:",
      error
    );

    res.status(500).json({
      message:
        "Failed to create rule",
    });
  }
});

/*
 * =========================
 * EDIT / VERSION RULE
 * =========================
 */

// PATCH /api/rules/:id
//
// Existing RuleVersions are immutable.
//
// Every meaningful edit creates a new
// RuleVersion.
//
// Identical data does NOT create another
// version.
router.patch("/:id", async (req, res) => {
  try {
    const result =
      ruleSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        message:
          "Invalid rule data",

        errors:
          result.error.flatten()
            .fieldErrors,
      });

      return;
    }

    const existingRule =
      await prisma.rule.findUnique({
        where: {
          id: req.params.id,
        },
      });

    if (!existingRule) {
      res.status(404).json({
        message: "Rule not found",
      });

      return;
    }

    if (!existingRule.isActive) {
      res.status(409).json({
        message:
          "Archived rules must be reactivated before editing",
      });

      return;
    }

    const severityOption =
      await resolveSeverityOption(
        result.data.severityOptionId
      );

    const weightOption =
      await resolveWeightOption(
        result.data.weightOptionId
      );

    const normalizedSeverityId =
      severityOption?.id ?? null;

    const normalizedWeightId =
      weightOption?.id ?? null;

    const comparableInput: ComparableRuleInput =
      {
        title: result.data.title,

        definition:
          result.data.definition,

        severityOptionId:
          normalizedSeverityId,

        weightOptionId:
          normalizedWeightId,
      };

    /*
     * Handles:
     *
     * - simultaneous edits;
     * - version-number collisions;
     * - duplicate-rule races;
     * - serializable transaction retries.
     */
    const MAX_VERSION_ATTEMPTS = 3;

    for (
      let attempt = 1;
      attempt <=
      MAX_VERSION_ATTEMPTS;
      attempt += 1
    ) {
      try {
        const transactionResult =
          await prisma.$transaction(
            async (tx) => {
              /*
               * Recheck the parent Rule inside
               * the transaction.
               */
              const currentRule =
                await tx.rule.findUnique({
                  where: {
                    id: existingRule.id,
                  },
                });

              if (!currentRule) {
                throw new Error(
                  "RULE_NOT_FOUND"
                );
              }

              if (
                !currentRule.isActive
              ) {
                throw new Error(
                  "RULE_INACTIVE"
                );
              }

              /*
               * A different Rule may not become
               * identical to this Rule.
               */
              const duplicate =
                await findIdenticalRule(
                  tx,
                  comparableInput,
                  currentRule.id
                );

              if (duplicate) {
                throw new IdenticalRuleError(
                  duplicate.id,
                  duplicate.isActive
                );
              }

              const latestVersion =
                await tx.ruleVersion.findFirst(
                  {
                    where: {
                      ruleId:
                        currentRule.id,
                    },

                    orderBy: {
                      versionNumber:
                        "desc",
                    },
                  }
                );

              /*
               * If the submitted form data is
               * effectively unchanged, do not
               * create another version.
               *
               * Case-only changes and extra
               * whitespace do not count as
               * meaningful rule changes.
               */
              if (latestVersion) {
                const latestComparable: ComparableRuleInput =
                  {
                    title:
                      latestVersion.title,

                    definition:
                      latestVersion.definition,

                    severityOptionId:
                      latestVersion
                        .severityOptionId,

                    weightOptionId:
                      latestVersion
                        .weightOptionId,
                  };

                const sameFormData =
                  sameRuleInput(
                    latestComparable,
                    comparableInput
                  );

                /*
                 * We additionally compare the
                 * snapshots. If the underlying
                 * configuration option changed,
                 * creating a new version is
                 * meaningful because it preserves
                 * the new historical configuration.
                 */
                const sameSnapshots =
                  latestVersion
                    .severityNameSnapshot ===
                    (severityOption?.name ??
                      null) &&
                  latestVersion
                    .weightNameSnapshot ===
                    (weightOption?.name ??
                      null) &&
                  latestVersion
                    .weightValueSnapshot ===
                    (weightOption?.value ??
                      null);

                if (
                  sameFormData &&
                  sameSnapshots
                ) {
                  return {
                    kind: "no-change" as const,

                    version:
                      latestVersion,
                  };
                }
              }

              const nextVersionNumber =
                (latestVersion
                  ?.versionNumber ?? 0) +
                1;

              const newVersion =
                await tx.ruleVersion.create(
                  {
                    data: {
                      ruleId:
                        currentRule.id,

                      versionNumber:
                        nextVersionNumber,

                      title:
                        result.data.title,

                      definition:
                        result.data
                          .definition,

                      severityOptionId:
                        normalizedSeverityId,

                      weightOptionId:
                        normalizedWeightId,

                      severityNameSnapshot:
                        severityOption?.name ??
                        null,

                      weightNameSnapshot:
                        weightOption?.name ??
                        null,

                      weightValueSnapshot:
                        weightOption?.value ??
                        null,
                    },
                  }
                );

              await tx.rule.update({
                where: {
                  id: currentRule.id,
                },

                data: {
                  updatedAt: new Date(),
                },
              });

              return {
                kind: "updated" as const,

                version:
                  newVersion,
              };
            },
            {
              isolationLevel:
                Prisma
                  .TransactionIsolationLevel
                  .Serializable,
            }
          );

        if (
          transactionResult.kind ===
          "no-change"
        ) {
          res.status(200).json({
            message:
              "No rule changes were detected",

            data:
              transactionResult.version,
          });

          return;
        }

        res.status(200).json({
          message:
            "New rule version created successfully",

          data:
            transactionResult.version,
        });

        return;
      } catch (error) {
        if (
          error instanceof
          IdenticalRuleError
        ) {
          sendIdenticalRuleResponse(
            error,
            res
          );

          return;
        }

        if (
          error instanceof Error &&
          error.message ===
            "RULE_NOT_FOUND"
        ) {
          res.status(404).json({
            message:
              "Rule not found",
          });

          return;
        }

        if (
          error instanceof Error &&
          error.message ===
            "RULE_INACTIVE"
        ) {
          res.status(409).json({
            message:
              "Archived rules must be reactivated before editing",
          });

          return;
        }

        const shouldRetry =
          isPrismaErrorCode(
            error,
            "P2002"
          ) ||
          isPrismaErrorCode(
            error,
            "P2034"
          );

        if (
          shouldRetry &&
          attempt <
            MAX_VERSION_ATTEMPTS
        ) {
          continue;
        }

        throw error;
      }
    }

    res.status(409).json({
      message:
        "The rule was updated by another request. Please try again.",
    });
  } catch (error) {
    if (
      handleRuleOptionError(
        error,
        res
      )
    ) {
      return;
    }

    console.error(
      "Failed to update rule:",
      error
    );

    res.status(500).json({
      message:
        "Failed to update rule",
    });
  }
});

/*
 * =========================
 * ARCHIVE RULE
 * =========================
 */

// PATCH /api/rules/:id/archive
router.patch(
  "/:id/archive",
  async (req, res) => {
    try {
      const existing =
        await prisma.rule.findUnique({
          where: {
            id: req.params.id,
          },
        });

      if (!existing) {
        res.status(404).json({
          message:
            "Rule not found",
        });

        return;
      }

      if (!existing.isActive) {
        res.status(409).json({
          message:
            "Rule is already archived",
        });

        return;
      }

      const rule =
        await prisma.rule.update({
          where: {
            id: req.params.id,
          },

          data: {
            isActive: false,
            archivedAt: new Date(),
          },
        });

      res.status(200).json({
        message:
          "Rule archived successfully",

        data: rule,
      });
    } catch (error) {
      console.error(
        "Failed to archive rule:",
        error
      );

      res.status(500).json({
        message:
          "Failed to archive rule",
      });
    }
  }
);

/*
 * =========================
 * REACTIVATE RULE
 * =========================
 */

// PATCH /api/rules/:id/reactivate
router.patch(
  "/:id/reactivate",
  async (req, res) => {
    try {
      const existing =
        await prisma.rule.findUnique({
          where: {
            id: req.params.id,
          },
        });

      if (!existing) {
        res.status(404).json({
          message:
            "Rule not found",
        });

        return;
      }

      if (existing.isActive) {
        res.status(409).json({
          message:
            "Rule is already active",
        });

        return;
      }

      const rule =
        await prisma.rule.update({
          where: {
            id: req.params.id,
          },

          data: {
            isActive: true,
            archivedAt: null,
          },
        });

      res.status(200).json({
        message:
          "Rule reactivated successfully",

        data: rule,
      });
    } catch (error) {
      console.error(
        "Failed to reactivate rule:",
        error
      );

      res.status(500).json({
        message:
          "Failed to reactivate rule",
      });
    }
  }
);

export default router;