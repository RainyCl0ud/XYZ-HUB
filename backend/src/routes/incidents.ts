import { Router } from "express";
import { z } from "zod";

import { prisma } from "../lib/prisma.js";

import {
  calculateExpiryDate,
  getCurrentStrikeLadder,
  getStrikeActivityStatus,
} from "../services/strike-ladder.js";

import type {
  IncidentWorkflowStatus,
} from "../services/strike-ladder.js";

const router = Router();

/*
 * =========================
 * STRIKE ACTIVITY HELPERS
 * =========================
 */

/**
 * Adds the calculated strike activity status to an incident
 * without modifying the stored incident record.
 *
 * Workflow status and strike activity remain separate:
 *
 * Workflow:
 * OPEN / RESOLVED / VOIDED
 *
 * Strike activity:
 * ACTIVE / EXPIRED / NOT_APPLICABLE
 *
 * OPEN and RESOLVED incidents can remain active strikes until
 * their individually stored expiry timestamp has passed.
 *
 * VOIDED incidents remain in history but never count as strikes.
 */
function withStrikeActivity<
  T extends {
    status: IncidentWorkflowStatus;
    expiresAt: Date;
  },
>(incident: T) {
  return {
    ...incident,

    strikeActivityStatus:
      getStrikeActivityStatus(
        incident
      ),
  };
}

/*
 * =========================
 * VALIDATION
 * =========================
 */

const createIncidentSchema =
  z.object({
    chatterId: z
      .string()
      .trim()
      .min(
        1,
        "Chatter is required"
      ),

    ruleId: z
      .string()
      .trim()
      .min(
        1,
        "Rule is required"
      ),

    details: z
      .string()
      .trim()
      .min(
        1,
        "Incident details are required"
      )
      .max(
        5000,
        "Incident details must be 5000 characters or fewer"
      ),

    evidenceUrl: z
      .string()
      .trim()
      .max(
        2000,
        "Evidence URL must be 2000 characters or fewer"
      )
      .url(
        "Evidence URL must be a valid URL"
      )
      .refine(
        (value) =>
          value.startsWith(
            "http://"
          ) ||
          value.startsWith(
            "https://"
          ),
        {
          message:
            "Evidence URL must begin with http:// or https://",
        }
      )
      .nullable()
      .optional(),
  });

const resolveIncidentSchema =
  z.object({
    resolutionNotes: z
      .string()
      .trim()
      .max(
        2000,
        "Resolution notes must be 2000 characters or fewer"
      )
      .nullable()
      .optional(),
  });

const voidIncidentSchema =
  z.object({
    reason: z
      .string()
      .trim()
      .min(
        1,
        "A reason is required when voiding an incident"
      )
      .max(
        2000,
        "Void reason must be 2000 characters or fewer"
      ),
  });

/*
 * =========================
 * GET INCIDENTS
 * =========================
 */

// GET /api/incidents
router.get(
  "/",
  async (req, res) => {
    try {
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
        await prisma.incident.findMany(
          {
            where: {
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
                    ruleVersion:
                      {
                        ruleId,
                      },
                  }
                : {}),
            },

            include: {
              chatter: {
                select: {
                  id: true,
                  name: true,
                  status: true,
                },
              },

              ruleVersion: {
                select: {
                  id: true,
                  ruleId: true,

                  versionNumber:
                    true,
                },
              },
            },

            orderBy: {
              occurredAt:
                "desc",
            },
          }
        );

      res.status(200).json({
        data:
          incidents.map(
            withStrikeActivity
          ),
      });
    } catch (error) {
      console.error(
        "Failed to fetch incidents:",
        error
      );

      res.status(500).json({
        message:
          "Failed to fetch incidents",
      });
    }
  }
);

/*
 * =========================
 * GET ONE INCIDENT
 * =========================
 */

// GET /api/incidents/:id
router.get(
  "/:id",
  async (req, res) => {
    try {
      const incident =
        await prisma.incident.findUnique(
          {
            where: {
              id: req.params.id,
            },

            include: {
              chatter: true,

              ruleVersion: {
                select: {
                  id: true,
                  ruleId: true,

                  versionNumber:
                    true,
                },
              },
            },
          }
        );

      if (!incident) {
        res.status(404).json({
          message:
            "Incident not found",
        });

        return;
      }

      res.status(200).json({
        data:
          withStrikeActivity(
            incident
          ),
      });
    } catch (error) {
      console.error(
        "Failed to fetch incident:",
        error
      );

      res.status(500).json({
        message:
          "Failed to fetch incident",
      });
    }
  }
);

/*
 * =========================
 * CREATE INCIDENT
 * =========================
 */

// POST /api/incidents
router.post(
  "/",
  async (req, res) => {
    try {
      const result =
        createIncidentSchema.safeParse(
          req.body
        );

      if (!result.success) {
        res.status(400).json({
          message:
            "Invalid incident data",

          errors:
            result.error
              .flatten()
              .fieldErrors,
        });

        return;
      }

      /*
       * -------------------------------------------------------
       * CHATTER
       * -------------------------------------------------------
       */

      const chatter =
        await prisma.chatter.findUnique(
          {
            where: {
              id:
                result.data
                  .chatterId,
            },
          }
        );

      if (!chatter) {
        res.status(400).json({
          message:
            "Selected chatter does not exist",
        });

        return;
      }

      if (
        chatter.status !==
        "ACTIVE"
      ) {
        res.status(400).json({
          message:
            "Selected chatter is inactive",
        });

        return;
      }

      /*
       * -------------------------------------------------------
       * RULE + CURRENT VERSION
       * -------------------------------------------------------
       */

      const rule =
        await prisma.rule.findUnique(
          {
            where: {
              id:
                result.data
                  .ruleId,
            },

            include: {
              versions: {
                orderBy: {
                  versionNumber:
                    "desc",
                },

                take: 1,
              },
            },
          }
        );

      if (!rule) {
        res.status(400).json({
          message:
            "Selected rule does not exist",
        });

        return;
      }

      if (!rule.isActive) {
        res.status(400).json({
          message:
            "Selected rule is archived",
        });

        return;
      }

      const currentVersion =
        rule.versions[0];

      if (!currentVersion) {
        res.status(400).json({
          message:
            "Selected rule does not have a valid version",
        });

        return;
      }

      /*
       * -------------------------------------------------------
       * CURRENT STRIKE LADDER
       * -------------------------------------------------------
       *
       * The strike duration is no longer hardcoded here.
       *
       * Management controls the duration through:
       *
       * System Configuration
       * → Strike Ladder
       *
       * The CURRENT ladder configuration is read when the
       * incident is created.
       *
       * Example:
       *
       * Ladder duration = 30 days
       * Incident created today
       * → expires exactly 30 x 24 hours later
       *
       * If management later changes the duration to 45 days,
       * this incident keeps its already stored expiry date.
       * Only newly created incidents use the new duration.
       */

      const strikeLadder =
        await getCurrentStrikeLadder();

      /*
       * occurredAt is generated on the server.
       *
       * The frontend cannot choose or override the incident
       * creation timestamp.
       */
      const occurredAt =
        new Date();

      const expiresAt =
        calculateExpiryDate(
          occurredAt,
          strikeLadder.durationDays
        );

      /*
       * -------------------------------------------------------
       * CREATE INCIDENT
       * -------------------------------------------------------
       */

      const incident =
        await prisma.incident.create(
          {
            data: {
              chatterId:
                chatter.id,

              ruleVersionId:
                currentVersion.id,

              /*
               * Historical rule snapshot.
               *
               * Future rule edits must never alter how this
               * incident appeared when it was created.
               */
              ruleTitleSnapshot:
                currentVersion
                  .title,

              ruleDefinitionSnapshot:
                currentVersion
                  .definition,

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

              /*
               * The actual expiration timestamp is stored
               * permanently on the incident.
               *
               * We intentionally do NOT recalculate this later
               * from whatever the current ladder duration becomes.
               */
              expiresAt,

              details:
                result.data
                  .details,

              evidenceUrl:
                result.data
                  .evidenceUrl ||
                null,
            },

            include: {
              chatter: {
                select: {
                  id: true,
                  name: true,
                  status: true,
                },
              },

              ruleVersion: {
                select: {
                  id: true,
                  ruleId: true,

                  versionNumber:
                    true,
                },
              },
            },
          }
        );

      res.status(201).json({
        message:
          "Incident logged successfully",

        data:
          withStrikeActivity(
            incident
          ),
      });
    } catch (error) {
      console.error(
        "Failed to log incident:",
        error
      );

      res.status(500).json({
        message:
          "Failed to log incident",
      });
    }
  }
);

/*
 * =========================
 * RESOLVE INCIDENT
 * =========================
 */

// PATCH /api/incidents/:id/resolve
router.patch(
  "/:id/resolve",
  async (req, res) => {
    try {
      const result =
        resolveIncidentSchema.safeParse(
          req.body
        );

      if (!result.success) {
        res.status(400).json({
          message:
            "Invalid resolution data",

          errors:
            result.error
              .flatten()
              .fieldErrors,
        });

        return;
      }

      const existing =
        await prisma.incident.findUnique(
          {
            where: {
              id: req.params.id,
            },
          }
        );

      if (!existing) {
        res.status(404).json({
          message:
            "Incident not found",
        });

        return;
      }

      if (
        existing.status ===
        "VOIDED"
      ) {
        res.status(409).json({
          message:
            "A voided incident cannot be resolved",
        });

        return;
      }

      if (
        existing.status ===
        "RESOLVED"
      ) {
        res.status(409).json({
          message:
            "Incident is already resolved",
        });

        return;
      }

      const incident =
        await prisma.incident.update(
          {
            where: {
              id: req.params.id,
            },

            data: {
              status:
                "RESOLVED",

              resolutionNotes:
                result.data
                  .resolutionNotes ||
                null,

              resolvedAt:
                new Date(),
            },

            include: {
              chatter: {
                select: {
                  id: true,
                  name: true,
                  status: true,
                },
              },

              ruleVersion: {
                select: {
                  id: true,
                  ruleId: true,

                  versionNumber:
                    true,
                },
              },
            },
          }
        );

      res.status(200).json({
        message:
          "Incident resolved successfully",

        data:
          withStrikeActivity(
            incident
          ),
      });
    } catch (error) {
      console.error(
        "Failed to resolve incident:",
        error
      );

      res.status(500).json({
        message:
          "Failed to resolve incident",
      });
    }
  }
);

/*
 * =========================
 * VOID INCIDENT
 * =========================
 */

// PATCH /api/incidents/:id/void
router.patch(
  "/:id/void",
  async (req, res) => {
    try {
      const result =
        voidIncidentSchema.safeParse(
          req.body
        );

      if (!result.success) {
        res.status(400).json({
          message:
            "Invalid void data",

          errors:
            result.error
              .flatten()
              .fieldErrors,
        });

        return;
      }

      const existing =
        await prisma.incident.findUnique(
          {
            where: {
              id: req.params.id,
            },
          }
        );

      if (!existing) {
        res.status(404).json({
          message:
            "Incident not found",
        });

        return;
      }

      if (
        existing.status ===
        "VOIDED"
      ) {
        res.status(409).json({
          message:
            "Incident is already voided",
        });

        return;
      }

      if (
        existing.status ===
        "RESOLVED"
      ) {
        res.status(409).json({
          message:
            "A resolved incident cannot be voided",
        });

        return;
      }

      const incident =
        await prisma.incident.update(
          {
            where: {
              id: req.params.id,
            },

            data: {
              status:
                "VOIDED",

              voidReason:
                result.data.reason,

              voidedAt:
                new Date(),
            },

            include: {
              chatter: {
                select: {
                  id: true,
                  name: true,
                  status: true,
                },
              },

              ruleVersion: {
                select: {
                  id: true,
                  ruleId: true,

                  versionNumber:
                    true,
                },
              },
            },
          }
        );

      res.status(200).json({
        message:
          "Incident voided successfully",

        data:
          withStrikeActivity(
            incident
          ),
      });
    } catch (error) {
      console.error(
        "Failed to void incident:",
        error
      );

      res.status(500).json({
        message:
          "Failed to void incident",
      });
    }
  }
);
export default router;