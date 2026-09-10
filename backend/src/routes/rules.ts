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
    .max(150, "Rule title must be 150 characters or fewer"),

  definition: z
    .string()
    .trim()
    .min(1, "Rule definition is required")
    .max(2000, "Rule definition must be 2000 characters or fewer"),

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
    throw new Error("SEVERITY_NOT_FOUND");
  }

  if (!option.isActive) {
    throw new Error("SEVERITY_INACTIVE");
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
    throw new Error("WEIGHT_NOT_FOUND");
  }

  if (!option.isActive) {
    throw new Error("WEIGHT_INACTIVE");
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
        message: "Selected severity option does not exist",
      });
      return true;
    case "SEVERITY_INACTIVE":
      res.status(400).json({
        message: "Selected severity option is archived",
      });
      return true;
    case "WEIGHT_NOT_FOUND":
      res.status(400).json({
        message: "Selected weight option does not exist",
      });
      return true;
    case "WEIGHT_INACTIVE":
      res.status(400).json({
        message: "Selected weight option is archived",
      });
      return true;
    default:
      return false;
  }
}

// GET /api/rules
router.get("/", async (req, res) => {
  try {
    const isActive =
      req.query.active === "true"
        ? true
        : req.query.active === "false"
          ? false
          : undefined;

    const rules = await prisma.rule.findMany({
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

    const data = rules.map((rule) => ({
      ...rule,

      currentVersion:
        rule.versions[0] ?? null,

      versions: undefined,
    }));

    res.status(200).json({
      data,
    });
  } catch (error) {
    console.error(
      "Failed to fetch rules:",
      error
    );

    res.status(500).json({
      message: "Failed to fetch rules",
    });
  }
});

// GET /api/rules/:id
router.get("/:id", async (req, res) => {
  try {
    const rule = await prisma.rule.findUnique({
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
      message: "Failed to fetch rule",
    });
  }
});

// POST /api/rules
router.post("/", async (req, res) => {
  try {
    const result =
      ruleSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        message: "Invalid rule data",

        errors:
          result.error.flatten().fieldErrors,
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

    const created =
      await prisma.$transaction(async (tx) => {
        const rule = await tx.rule.create({
          data: {},
        });

        const version =
          await tx.ruleVersion.create({
            data: {
              ruleId: rule.id,
              versionNumber: 1,

              title: result.data.title,
              definition:
                result.data.definition,

              severityOptionId:
                severityOption?.id ?? null,

              weightOptionId:
                weightOption?.id ?? null,

              severityNameSnapshot:
                severityOption?.name ?? null,

              weightNameSnapshot:
                weightOption?.name ?? null,

              weightValueSnapshot:
                weightOption?.value ?? null,
            },
          });

        return {
          rule,
          version,
        };
      });

    res.status(201).json({
      message:
        "Rule created successfully",

      data: {
        ...created.rule,

        currentVersion:
          created.version,
      },
    });
  } catch (error) {
    if (handleRuleOptionError(error, res)) {
      return;
    }

    console.error(
      "Failed to create rule:",
      error
    );

    res.status(500).json({
      message: "Failed to create rule",
    });
  }
});

// PATCH /api/rules/:id
//
// IMPORTANT:
// Editing never changes an existing RuleVersion.
// Every real change creates a new immutable version.
router.patch("/:id", async (req, res) => {
  try {
    const result =
      ruleSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        message: "Invalid rule data",

        errors:
          result.error.flatten().fieldErrors,
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

    /*
     * Retry only if two requests attempt to create
     * the same version number at nearly the same time.
     *
     * The database composite unique constraint:
     *
     * @@unique([ruleId, versionNumber])
     *
     * remains the final protection.
     */
    const MAX_VERSION_ATTEMPTS = 3;

    for (
      let attempt = 1;
      attempt <= MAX_VERSION_ATTEMPTS;
      attempt += 1
    ) {
      try {
        const latestVersion =
          await prisma.ruleVersion.findFirst({
            where: {
              ruleId: existingRule.id,
            },

            orderBy: {
              versionNumber: "desc",
            },
          });

        /*
         * Do not create meaningless duplicate
         * versions if nothing actually changed.
         */
        if (
          latestVersion &&
          latestVersion.title ===
            result.data.title &&
          latestVersion.definition ===
            result.data.definition &&
          latestVersion.severityOptionId ===
            normalizedSeverityId &&
          latestVersion.weightOptionId ===
            normalizedWeightId &&
          latestVersion.severityNameSnapshot ===
            (severityOption?.name ?? null) &&
          latestVersion.weightNameSnapshot ===
            (weightOption?.name ?? null) &&
          latestVersion.weightValueSnapshot ===
            (weightOption?.value ?? null)
        ) {
          res.status(200).json({
            message:
              "No rule changes were detected",

            data: latestVersion,
          });

          return;
        }

        const nextVersionNumber =
          (latestVersion?.versionNumber ??
            0) + 1;

        const version =
          await prisma.$transaction(
            async (tx) => {
              /*
               * Recheck the Rule inside the
               * transaction so an archived Rule
               * cannot be edited by a stale request.
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

              if (!currentRule.isActive) {
                throw new Error(
                  "RULE_INACTIVE"
                );
              }

              const newVersion =
                await tx.ruleVersion.create({
                  data: {
                    ruleId: currentRule.id,
                    versionNumber:
                      nextVersionNumber,

                    title:
                      result.data.title,

                    definition:
                      result.data.definition,

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
                });

              await tx.rule.update({
                where: {
                  id: currentRule.id,
                },

                data: {
                  updatedAt: new Date(),
                },
              });

              return newVersion;
            }
          );

        res.status(200).json({
          message:
            "New rule version created successfully",

          data: version,
        });

        return;
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "RULE_NOT_FOUND"
        ) {
          res.status(404).json({
            message: "Rule not found",
          });

          return;
        }

        if (
          error instanceof Error &&
          error.message === "RULE_INACTIVE"
        ) {
          res.status(409).json({
            message:
              "Archived rules must be reactivated before editing",
          });

          return;
        }

        const isVersionConflict =
          error instanceof
            Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002";

        if (
          isVersionConflict &&
          attempt < MAX_VERSION_ATTEMPTS
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
    if (handleRuleOptionError(error, res)) {
      return;
    }

    console.error(
      "Failed to update rule:",
      error
    );

    res.status(500).json({
      message: "Failed to update rule",
    });
  }
});

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
          message: "Rule not found",
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
          message: "Rule not found",
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