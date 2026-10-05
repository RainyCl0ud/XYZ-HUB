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

import {
  requireQaIncidentWrites,
} from "../middleware/qa-access.js";

import legacyIncidentRoutes from "./incidents.js";

import {
  buildIncidentModelWhere,
  QaAccessError,
  readRequestedModelId,
  resolveIncidentCreationModel,
  resolveQaModelScope,
} from "../services/qa-access.js";

const router =
  Router();

// Guard both the scoped handlers and legacy workflow handlers.
router.use(requireQaIncidentWrites);

function getRouteParam(
  value:
    string |
    string[] |
    undefined
) {
  return Array.isArray(
    value
  )
    ? value[0]
    : value;
}

const createIncidentSchema =
  z.object({
    chatterId:
      z
        .string()
        .trim()
        .min(1),

    ruleId:
      z
        .string()
        .trim()
        .min(1),

    details:
      z
        .string()
        .trim()
        .min(1)
        .max(5000),

    evidenceUrl:
      z
        .string()
        .trim()
        .max(2000)
        .url()
        .refine(
          (
            value
          ) =>
            value.startsWith(
              "http://"
            ) ||
            value.startsWith(
              "https://"
            )
        )
        .nullable()
        .optional(),
  });

function handleQaAccessError(
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

  const status =
    error.code ===
      "MODEL_NOT_ACCESSIBLE"
      ? 403
      : error.code ===
          "MODEL_NOT_FOUND"
        ? 404
        : 400;

  res.status(
    status
  ).json({
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
    if (
      !req.access
    ) {
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

      const status =
        req.query.status ===
          "OPEN" ||
        req.query.status ===
          "RESOLVED" ||
        req.query.status ===
          "VOIDED"
          ? req.query.status
          : undefined;

      const chatterId =
        typeof req.query
          .chatterId ===
          "string"
          ? req.query.chatterId
          : undefined;

      const ruleId =
        typeof req.query.ruleId ===
        "string"
          ? req.query.ruleId
          : undefined;

      const incidents =
        await prisma.incident.findMany({
          where: {
            ...buildIncidentModelWhere(
              scope
            ),

            ...(status
              ? {
                  status,
                }
              : {}),

            ...(chatterId
              ? {
                  chatterId,
                }
              : {}),

            ...(ruleId
              ? {
                  ruleVersion: {
                    ruleId,
                  },
                }
              : {}),
          },

          include: {
            chatter: {
              select: {
                id:
                  true,
                name:
                  true,
                userId: true,
                status:
                  true,
              },
            },

            ruleVersion: {
              select: {
                id:
                  true,
                ruleId:
                  true,
                versionNumber:
                  true,
              },
            },

            agencyModel: {
              select: {
                id:
                  true,
                name:
                  true,
                isActive:
                  true,
              },
            },
          },

          orderBy: {
            occurredAt:
              "desc",
          },
        });

      res.status(200).json({
        data: incidents,
      });
    } catch (
      error
    ) {
      if (
        handleQaAccessError(
          error,
          res
        )
      ) {
        return;
      }

      console.error(
        "Failed to fetch scoped incidents:",
        error
      );

      res.status(500).json({
        message:
          "Failed to fetch incidents",
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
    if (
      !req.access
    ) {
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

      const incidentId =
        getRouteParam(
          req.params.id
        );

      if (
        !incidentId
      ) {
        res.status(400).json({
          error:
            "INVALID_INCIDENT_ID",

          message:
            "A valid incident ID is required.",
        });

        return;
      }

      const incident =
        await prisma.incident.findFirst({
          where: {
            id:
              incidentId,

            ...buildIncidentModelWhere(
              scope
            ),
          },

          include: {
            chatter:
              true,

            ruleVersion: {
              select: {
                id:
                  true,
                ruleId:
                  true,
                versionNumber:
                  true,
              },
            },

            agencyModel: {
              select: {
                id:
                  true,
                name:
                  true,
                isActive:
                  true,
              },
            },
          },
        });

      if (
        !incident
      ) {
        res.status(404).json({
          message:
            "Incident not found",
        });

        return;
      }

      res.status(200).json({
        data:
          incident,
      });
    } catch (
      error
    ) {
      if (
        handleQaAccessError(
          error,
          res
        )
      ) {
        return;
      }

      console.error(
        "Failed to fetch scoped incident:",
        error
      );

      res.status(500).json({
        message:
          "Failed to fetch incident",
      });
    }
  }
);

router.post(
  "/",

  async (
    req:
      AuthenticatedRequest,
    res
  ) => {
    if (
      !req.access
    ) {
      res.status(401).json({
        error:
          "UNAUTHENTICATED",
      });

      return;
    }

    const parsed =
      createIncidentSchema.safeParse(
        req.body
      );

    if (
      !parsed.success
    ) {
      res.status(400).json({
        message:
          "Invalid incident data",

        errors:
          parsed.error
            .flatten()
            .fieldErrors,
      });

      return;
    }

    try {
      const creationContext =
        await resolveIncidentCreationModel(
          req.access,
          parsed.data
            .chatterId,
          readRequestedModelId(
            req.headers[
              "x-xyz-model-id"
            ]
          )
        );

      if (
        !creationContext
      ) {
        res.status(400).json({
          message:
            "Selected chatter does not exist",
        });

        return;
      }

      if (
        creationContext.error
      ) {
        res.status(400).json({
          message:
            creationContext.error,
        });

        return;
      }

      if (
        !creationContext.model
      ) {
        res.status(400).json({
          message:
            "A model is required to log an incident.",
        });

        return;
      }

      const rule =
        await prisma.rule.findUnique({
          where: {
            id:
              parsed.data.ruleId,
          },

          include: {
            versions: {
              orderBy: {
                versionNumber:
                  "desc",
              },

              take:
                1,
            },
          },
        });

      if (
        !rule ||
        !rule.isActive ||
        !rule.versions[0]
      ) {
        res.status(400).json({
          message:
            "Selected rule is unavailable",
        });

        return;
      }

      const currentVersion =
        rule.versions[0];

      const occurredAt =
        new Date();

      const incident =
        await prisma.incident.create({
          data: {
            chatterId:
              creationContext
                .chatter.id,

            ruleVersionId:
              currentVersion.id,

            modelId:
              creationContext
                .model.id,

            ruleTitleSnapshot:
              currentVersion.title,

            ruleDefinitionSnapshot:
              currentVersion.definition,

            severityNameSnapshot:
              currentVersion
                .severityNameSnapshot,

            weightNameSnapshot:
              currentVersion
                .weightNameSnapshot,

            weightValueSnapshot:
              currentVersion
                .weightValueSnapshot,

            occurredAt,

            details:
              parsed.data.details,

            evidenceUrl:
              parsed.data
                .evidenceUrl ||
              null,
          },

          include: {
            chatter: {
              select: {
                id:
                  true,
                name:
                  true,
                userId: true,
                status:
                  true,
              },
            },

            ruleVersion: {
              select: {
                id:
                  true,
                ruleId:
                  true,
                versionNumber:
                  true,
              },
            },

            agencyModel: {
              select: {
                id:
                  true,
                name:
                  true,
                isActive:
                  true,
              },
            },
          },
        });

      res.status(201).json({
        message:
          "Incident logged successfully",

        data:
          incident,
      });
    } catch (
      error
    ) {
      if (
        handleQaAccessError(
          error,
          res
        )
      ) {
        return;
      }

      console.error(
        "Failed to log scoped incident:",
        error
      );

      res.status(500).json({
        message:
          "Failed to log incident",
      });
    }
  }
);

async function ensureIncidentAccess(
  req:
    AuthenticatedRequest,
  res:
    Response,
  next:
    NextFunction
) {
  if (
    !req.access
  ) {
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

    const incidentId =
      getRouteParam(
        req.params.id
      );

    if (
      !incidentId
    ) {
      res.status(400).json({
        error:
          "INVALID_INCIDENT_ID",

        message:
          "A valid incident ID is required.",
      });

      return;
    }

    const incident =
      await prisma.incident.findFirst({
        where: {
          id:
            incidentId,

          ...buildIncidentModelWhere(
            scope
          ),
        },

        select: {
          id:
            true,
        },
      });

    if (
      !incident
    ) {
      res.status(404).json({
        message:
          "Incident not found",
      });

      return;
    }

    next();
  } catch (
    error
  ) {
    if (
      handleQaAccessError(
        error,
        res
      )
    ) {
      return;
    }

    res.status(500).json({
      message:
        "Unable to verify incident access",
    });
  }
}

router.patch(
  "/:id/resolve",
  ensureIncidentAccess
);

router.patch(
  "/:id/void",
  ensureIncidentAccess
);

/*
 * The existing PATCH implementations remain the
 * single source of truth for workflow transitions.
 * They are reached only after the access guard above.
 */
router.use(
  legacyIncidentRoutes
);

export default router;
