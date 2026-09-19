import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { getCurrentStrikeLadder } from "../services/strike-ladder.js";

const router = Router();

const chatterNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Chatter name is required")
    .max(
      100,
      "Chatter name must be 100 characters or fewer"
    ),
});

const chatterSearchSchema = z
  .string()
  .trim()
  .max(
    150,
    "Search query must be 150 characters or fewer"
  )
  .optional();

/*
 * =========================================================
 * SEARCH DESIGN
 * =========================================================
 *
 * The frontend will use one general search parameter:
 *
 *   ?search=rain
 *
 * Right now Chatter only has:
 *
 *   - name
 *
 * In the future, when the database contains fields such as:
 *
 *   - discordUsername
 *   - telegramUsername
 *   - email
 *   - externalId
 *
 * we only need to add them to this OR list.
 *
 * The frontend search box will NOT need to change.
 */
function buildChatterSearchWhere(
  search?: string
) {
  if (!search) {
    return undefined;
  }

  return {
    OR: [
      {
        name: {
          contains: search,
          mode: "insensitive" as const,
        },
      },

      /*
       * FUTURE EXAMPLES:
       *
       * Add these only after the fields exist
       * in the Prisma Chatter model:
       *
       * {
       *   discordUsername: {
       *     contains: search,
       *     mode: "insensitive",
       *   },
       * },
       *
       * {
       *   telegramUsername: {
       *     contains: search,
       *     mode: "insensitive",
       *   },
       * },
       *
       * {
       *   email: {
       *     contains: search,
       *     mode: "insensitive",
       *   },
       * },
       */
    ],
  };
}

/*
 * =========================================================
 * GET CHATTERS
 * =========================================================
 */

// GET /api/chatters
//
// Supported examples:
//
// /api/chatters
//
// /api/chatters?status=ACTIVE
//
// /api/chatters?status=INACTIVE
//
// /api/chatters?search=rain
//
// /api/chatters?status=ACTIVE&search=rain
router.get("/", async (req, res) => {
  try {
    const status =
      req.query.status === "ACTIVE" ||
      req.query.status === "INACTIVE"
        ? req.query.status
        : undefined;

    const rawSearch =
      typeof req.query.search === "string"
        ? req.query.search
        : undefined;

    const searchResult =
      chatterSearchSchema.safeParse(
        rawSearch
      );

    if (!searchResult.success) {
      res.status(400).json({
        message:
          "Invalid chatter search",

        errors:
          searchResult.error.flatten()
            .formErrors,
      });

      return;
    }

    const search =
      searchResult.data?.trim() || undefined;

    const searchWhere =
      buildChatterSearchWhere(search);

    const chatters =
      await prisma.chatter.findMany({
        where: {
          ...(status
            ? {
                status,
              }
            : {}),

          ...(searchWhere ?? {}),
        },

        orderBy: {
          name: "asc",
        },
      });

    res.status(200).json({
      data: chatters,
    });
  } catch (error) {
    console.error(
      "Failed to fetch chatters:",
      error
    );

    res.status(500).json({
      message:
        "Failed to fetch chatters",
    });
  }
});

/*
 * =========================================================
 * GET ONE CHATTER
 * =========================================================
 */

// GET /api/chatters/:id
router.get("/:id", async (req, res) => {
  try {
    const chatter =
      await prisma.chatter.findUnique({
        where: {
          id: req.params.id,
        },
      });

    if (!chatter) {
      res.status(404).json({
        message:
          "Chatter not found",
      });

      return;
    }

    /*
     * Current strike standing is derived live.
     *
     * We intentionally do NOT persist:
     *
     * - currentStrikeCount
     * - currentStanding
     * - currentDeduction
     *
     * Those values can change automatically when a strike expires
     * or when management creates a new strike-ladder version.
     */
    const now = new Date();

    const [
      strikeLadder,
      activeStrikeIncidents,
    ] = await Promise.all([
      getCurrentStrikeLadder(),

      prisma.incident.findMany({
        where: {
          chatterId:
            chatter.id,

          /*
           * RESOLVED incidents still count until expiry.
           * VOIDED incidents never count.
           */
          status: {
            not: "VOIDED",
          },

          expiresAt: {
            gt: now,
          },
        },

        select: {
          expiresAt: true,
        },

        orderBy: {
          expiresAt: "asc",
        },
      }),
    ]);

    const activeStrikeCount =
      activeStrikeIncidents.length;

    /*
     * The current standing uses the CURRENT ladder version.
     *
     * The highest step whose threshold is less than or equal to
     * the chatter's active strike count wins.
     *
     * If the count is above the final configured step, the final
     * step continues to apply.
     */
    const orderedSteps =
      [...strikeLadder.steps].sort(
        (first, second) =>
          first.minActiveStrikes -
          second.minActiveStrikes
      );

    let matchedStep =
      orderedSteps[0] ?? null;

    for (const step of orderedSteps) {
      if (
        step.minActiveStrikes <=
        activeStrikeCount
      ) {
        matchedStep = step;
        continue;
      }

      break;
    }

    const strikeSummary = {
      activeStrikeCount,

      standingLabel:
        matchedStep?.standingLabel ??
        "Clear",

      deductionPercent:
        matchedStep?.deductionPercent ??
        0,

      nextExpiryAt:
        activeStrikeIncidents[0]
          ?.expiresAt ?? null,

      ladderVersionId:
        strikeLadder.id,

      ladderVersion:
        strikeLadder.versionNumber,
    };

    res.status(200).json({
      data: {
        ...chatter,
        strikeSummary,
      },
    });
  } catch (error) {
    console.error(
      "Failed to fetch chatter:",
      error
    );

    res.status(500).json({
      message:
        "Failed to fetch chatter",
    });
  }
});

/*
 * =========================================================
 * CREATE CHATTER
 * =========================================================
 */

// POST /api/chatters
router.post("/", async (req, res) => {
  try {
    const result =
      chatterNameSchema.safeParse(
        req.body
      );

    if (!result.success) {
      res.status(400).json({
        message:
          "Invalid chatter data",

        errors:
          result.error.flatten()
            .fieldErrors,
      });

      return;
    }

    const existingChatter =
      await prisma.chatter.findFirst({
        where: {
          name: {
            equals:
              result.data.name,

            mode: "insensitive",
          },
        },
      });

    if (existingChatter) {
      res.status(409).json({
        message:
          "A chatter with this name already exists",
      });

      return;
    }

    const chatter =
      await prisma.chatter.create({
        data: {
          name: result.data.name,
        },
      });

    res.status(201).json({
      message:
        "Chatter created successfully",

      data: chatter,
    });
  } catch (error) {
    console.error(
      "Failed to create chatter:",
      error
    );

    res.status(500).json({
      message:
        "Failed to create chatter",
    });
  }
});

/*
 * =========================================================
 * EDIT CHATTER
 * =========================================================
 */

// PATCH /api/chatters/:id
router.patch("/:id", async (req, res) => {
  try {
    const result =
      chatterNameSchema.safeParse(
        req.body
      );

    if (!result.success) {
      res.status(400).json({
        message:
          "Invalid chatter data",

        errors:
          result.error.flatten()
            .fieldErrors,
      });

      return;
    }

    const existingChatter =
      await prisma.chatter.findUnique({
        where: {
          id: req.params.id,
        },
      });

    if (!existingChatter) {
      res.status(404).json({
        message:
          "Chatter not found",
      });

      return;
    }

    const duplicate =
      await prisma.chatter.findFirst({
        where: {
          id: {
            not: req.params.id,
          },

          name: {
            equals:
              result.data.name,

            mode: "insensitive",
          },
        },
      });

    if (duplicate) {
      res.status(409).json({
        message:
          "A chatter with this name already exists",
      });

      return;
    }

    /*
     * Do not perform a meaningless database
     * update when the normalized name did not
     * actually change.
     */
    if (
      existingChatter.name.trim() ===
      result.data.name.trim()
    ) {
      res.status(200).json({
        message:
          "No chatter changes were detected",

        data:
          existingChatter,
      });

      return;
    }

    const chatter =
      await prisma.chatter.update({
        where: {
          id: req.params.id,
        },

        data: {
          name: result.data.name,
        },
      });

    res.status(200).json({
      message:
        "Chatter updated successfully",

      data: chatter,
    });
  } catch (error) {
    console.error(
      "Failed to update chatter:",
      error
    );

    res.status(500).json({
      message:
        "Failed to update chatter",
    });
  }
});

/*
 * =========================================================
 * DEACTIVATE CHATTER
 * =========================================================
 */

// PATCH /api/chatters/:id/deactivate
router.patch(
  "/:id/deactivate",
  async (req, res) => {
    try {
      const existingChatter =
        await prisma.chatter.findUnique({
          where: {
            id: req.params.id,
          },
        });

      if (!existingChatter) {
        res.status(404).json({
          message:
            "Chatter not found",
        });

        return;
      }

      if (
        existingChatter.status ===
        "INACTIVE"
      ) {
        res.status(409).json({
          message:
            "Chatter is already inactive",
        });

        return;
      }

      const chatter =
        await prisma.chatter.update({
          where: {
            id: req.params.id,
          },

          data: {
            status: "INACTIVE",
          },
        });

      res.status(200).json({
        message:
          "Chatter deactivated successfully",

        data: chatter,
      });
    } catch (error) {
      console.error(
        "Failed to deactivate chatter:",
        error
      );

      res.status(500).json({
        message:
          "Failed to deactivate chatter",
      });
    }
  }
);

/*
 * =========================================================
 * REACTIVATE CHATTER
 * =========================================================
 */

// PATCH /api/chatters/:id/reactivate
router.patch(
  "/:id/reactivate",
  async (req, res) => {
    try {
      const existingChatter =
        await prisma.chatter.findUnique({
          where: {
            id: req.params.id,
          },
        });

      if (!existingChatter) {
        res.status(404).json({
          message:
            "Chatter not found",
        });

        return;
      }

      if (
        existingChatter.status ===
        "ACTIVE"
      ) {
        res.status(409).json({
          message:
            "Chatter is already active",
        });

        return;
      }

      const chatter =
        await prisma.chatter.update({
          where: {
            id: req.params.id,
          },

          data: {
            status: "ACTIVE",
          },
        });

      res.status(200).json({
        message:
          "Chatter reactivated successfully",

        data: chatter,
      });
    } catch (error) {
      console.error(
        "Failed to reactivate chatter:",
        error
      );

      res.status(500).json({
        message:
          "Failed to reactivate chatter",
      });
    }
  }
);

export default router;