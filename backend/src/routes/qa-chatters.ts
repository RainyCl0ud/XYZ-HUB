import {
  Router,
} from "express";

import type {
  NextFunction,
  Response,
} from "express";

import {
  z,
} from "zod";

import {
  prisma,
} from "../lib/prisma.js";

import type {
  AuthenticatedRequest,
} from "../middleware/access.js";

import legacyChatterRoutes from "./chatters.js";

import {
  buildChatterModelWhere,
  QaAccessError,
  readRequestedModelId,
  resolveQaModelScope,
} from "../services/qa-access.js";

import {
  publishLiveUpdate,
} from "../services/live-updates.js";

const router =
  Router();

const chatterNameSchema =
  z.object({
    name:
      z
        .string()
        .trim()
        .min(1, "Chatter name is required")
        .max(
          100,
          "Chatter name must be 100 characters or fewer"
        ),
  });

function getRouteParam(
  value:
    string |
    string[] |
    undefined
) {
  return Array.isArray(value)
    ? value[0]
    : value;
}

function handleScopeError(
  error:
    unknown,
  res:
    Response
) {
  if (
    !(error instanceof
      QaAccessError)
  ) {
    return false;
  }

  res.status(403).json({
    error:
      error.code,
    message:
      error.message,
  });

  return true;
}

router.get(
  "/",
  async (
    req:
      AuthenticatedRequest,
    res
  ) => {
    if (!req.access) {
      res.status(401).json({
        error:
          "UNAUTHENTICATED",
      });
      return;
    }

    try {
      const status =
        req.query.status ===
          "ACTIVE" ||
        req.query.status ===
          "INACTIVE"
          ? req.query.status
          : undefined;

      const search =
        typeof req.query.search ===
          "string"
          ? req.query.search
              .trim()
              .slice(0, 100)
          : "";

      const scope =
        await resolveQaModelScope(
          req.access,
          readRequestedModelId(
            req.headers[
              "x-xyz-model-id"
            ]
          )
        );

      const chatters =
        await prisma.chatter.findMany({
          where: {
            // Keep creator authorization separate from the search OR below.
            AND: [
              buildChatterModelWhere(
                scope
              ),
            ],
            ...(status
              ? {
                  status,
                }
              : {}),
            ...(search
              ? {
                  OR: [
                    {
                      name: {
                        contains:
                          search,
                        mode:
                          "insensitive",
                      },
                    },
                    {
                      user: {
                        name: {
                          contains:
                            search,
                          mode:
                            "insensitive",
                        },
                      },
                    },
                  ],
                }
              : {}),
          },
          include: {
            user: {
              select: {
                name: true,
              },
            },
          },
          orderBy: {
            name:
              "asc",
          },
        });

      res.status(200).json({
        data:
          chatters.map(
            (
              chatter
            ) => ({
              ...chatter,
              name:
                chatter.name,
              user:
                undefined,
            })
          ),
      });
    } catch (error) {
      if (
        handleScopeError(
          error,
          res
        )
      ) {
        return;
      }

      console.error(
        "Failed to fetch scoped chatters:",
        error
      );
      res.status(500).json({
        message:
          "Failed to fetch chatters",
      });
    }
  }
);

router.get(
  "/:id",
  async (
    req:
      AuthenticatedRequest,
    res
  ) => {
    if (!req.access) {
      res.status(401).json({
        error:
          "UNAUTHENTICATED",
      });
      return;
    }

    try {
      const scope =
        await resolveQaModelScope(
          req.access,
          readRequestedModelId(
            req.headers[
              "x-xyz-model-id"
            ]
          )
        );

      const chatterId =
        getRouteParam(
          req.params.id
        );

      if (!chatterId) {
        res.status(400).json({
          error:
            "INVALID_CHATTER_ID",
          message:
            "A valid chatter ID is required.",
        });
        return;
      }

      const chatter =
        await prisma.chatter.findFirst({
          where: {
            id:
              chatterId,
            ...buildChatterModelWhere(
              scope
            ),
          },
          include: {
            user: {
              select: {
                name: true,
              },
            },
          },
        });

      if (!chatter) {
        res.status(404).json({
          message:
            "Chatter not found",
        });
        return;
      }

      const {
        user,
        ...chatterData
      } = chatter;

      void user;

      res.status(200).json({
        data: {
          ...chatterData,
          name:
            chatter.name,
        },
      });
    } catch (error) {
      if (
        handleScopeError(
          error,
          res
        )
      ) {
        return;
      }

      console.error(
        "Failed to fetch scoped chatter:",
        error
      );
      res.status(500).json({
        message:
          "Failed to fetch chatter",
      });
    }
  }
);

async function ensureChatterAccess(
  req:
    AuthenticatedRequest,
  res:
    Response,
  next:
    NextFunction
) {
  if (!req.access) {
    res.status(401).json({
      error:
        "UNAUTHENTICATED",
    });
    return;
  }

  try {
    const scope =
      await resolveQaModelScope(
        req.access,
        readRequestedModelId(
          req.headers[
            "x-xyz-model-id"
          ]
        )
      );

    const chatterId =
      getRouteParam(
        req.params.id
      );

    if (!chatterId) {
      res.status(400).json({
        error:
          "INVALID_CHATTER_ID",
        message:
          "A valid chatter ID is required.",
      });
      return;
    }

    const chatter =
      await prisma.chatter.findFirst({
        where: {
          id:
            chatterId,
          ...buildChatterModelWhere(
            scope
          ),
        },
        select: {
          id: true,
        },
      });

    if (!chatter) {
      res.status(404).json({
        message:
          "Chatter not found",
      });
      return;
    }

    next();
  } catch (error) {
    if (
      handleScopeError(
        error,
        res
      )
    ) {
      return;
    }

    console.error(
      "Unable to verify chatter access:",
      error
    );
    res.status(500).json({
      message:
        "Unable to verify chatter access",
    });
  }
}

router.patch(
  [
    "/:id",
    "/:id/deactivate",
    "/:id/reactivate",
  ],
  ensureChatterAccess
);

/*
 * Linked QA chatter records and Login Gate users represent the same
 * employee identity. Rename both atomically so current incident views,
 * People Management, and chatter selectors never drift apart.
 */
router.patch(
  "/:id",
  async (
    req:
      AuthenticatedRequest,
    res
  ) => {
    const parsed =
      chatterNameSchema.safeParse(
        req.body
      );

    if (!parsed.success) {
      res.status(400).json({
        message:
          "Invalid chatter data",
        errors:
          parsed.error.flatten()
            .fieldErrors,
      });
      return;
    }

    const chatterId =
      getRouteParam(
        req.params.id
      );

    if (!chatterId) {
      res.status(400).json({
        message:
          "A valid chatter ID is required.",
      });
      return;
    }

    const existing =
      await prisma.chatter.findUnique({
        where: {
          id:
            chatterId,
        },
        select: {
          id: true,
          userId: true,
          name: true,
        },
      });

    if (!existing) {
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
            not:
              chatterId,
          },
          name: {
            equals:
              parsed.data.name,
            mode:
              "insensitive",
          },
        },
        select: {
          id: true,
        },
      });

    if (duplicate) {
      res.status(409).json({
        message:
          "A chatter with this name already exists",
      });
      return;
    }

    const updated =
      await prisma.$transaction(
        async (
          tx
        ) => {
          const chatter =
            await tx.chatter.update({
              where: {
                id:
                  chatterId,
              },
              data: {
                name:
                  parsed.data.name,
              },
            });

          if (existing.userId) {
            await tx.user.update({
              where: {
                id:
                  existing.userId,
              },
              data: {
                name:
                  parsed.data.name,
              },
            });
          }

          return chatter;
        }
      );

    if (existing.userId) {
      publishLiveUpdate({
        type: "people.changed",
        userId:
          existing.userId,
      });
    }

    res.status(200).json({
      message:
        "Chatter updated successfully",
      data:
        updated,
    });
  }
);

/*
 * Chatters are added in People: giving someone the Chatter or Trial Chatter
 * role creates their QA profile. A name-only chatter, with no person behind
 * it, can't receive strikes or appear in a creator's roster, so one is no
 * longer created here (24 Nov 2026).
 */
router.post(
  "/",
  (
    _req,
    res
  ) => {
    res
      .status(405)
      .set(
        "Allow",
        "GET"
      )
      .json({
        message:
          "Chatters are added in People. Give the person the Chatter or Trial Chatter role.",
      });
  }
);

/* Deactivate/reactivate continue through the existing scoped legacy handlers. */
router.use(
  legacyChatterRoutes
);

export default router;
