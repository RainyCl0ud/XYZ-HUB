import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";

const router = Router();

const createIncidentSchema = z.object({
  chatterId: z
    .string()
    .trim()
    .min(1, "Chatter is required"),

  ruleId: z
    .string()
    .trim()
    .min(1, "Rule is required"),

  occurredAt: z.coerce.date().optional(),

  details: z
    .string()
    .trim()
    .min(1, "Incident details are required")
    .max(5000, "Incident details must be 5000 characters or fewer"),

  evidenceUrl: z
    .string()
    .trim()
    .max(2000, "Evidence URL must be 2000 characters or fewer")
    .nullable()
    .optional(),
});

const resolveIncidentSchema = z.object({
  resolutionNotes: z
    .string()
    .trim()
    .max(2000, "Resolution notes must be 2000 characters or fewer")
    .nullable()
    .optional(),
});

const voidIncidentSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "A reason is required when voiding an incident")
    .max(2000, "Void reason must be 2000 characters or fewer"),
});

// GET /api/incidents
router.get("/", async (req, res) => {
  try {
    const status =
      req.query.status === "OPEN" ||
      req.query.status === "RESOLVED" ||
      req.query.status === "VOIDED"
        ? req.query.status
        : undefined;

    const chatterId =
      typeof req.query.chatterId === "string"
        ? req.query.chatterId
        : undefined;

    const ruleId =
      typeof req.query.ruleId === "string"
        ? req.query.ruleId
        : undefined;

    const incidents = await prisma.incident.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(chatterId ? { chatterId } : {}),
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
            id: true,
            name: true,
            status: true,
          },
        },

        ruleVersion: {
          select: {
            id: true,
            ruleId: true,
            versionNumber: true,
          },
        },
      },

      orderBy: {
        occurredAt: "desc",
      },
    });

    res.status(200).json({
      data: incidents,
    });
  } catch (error) {
    console.error("Failed to fetch incidents:", error);

    res.status(500).json({
      message: "Failed to fetch incidents",
    });
  }
});

// GET /api/incidents/:id
router.get("/:id", async (req, res) => {
  try {
    const incident = await prisma.incident.findUnique({
      where: {
        id: req.params.id,
      },

      include: {
        chatter: true,

        ruleVersion: {
          select: {
            id: true,
            ruleId: true,
            versionNumber: true,
          },
        },
      },
    });

    if (!incident) {
      res.status(404).json({
        message: "Incident not found",
      });
      return;
    }

    res.status(200).json({
      data: incident,
    });
  } catch (error) {
    console.error("Failed to fetch incident:", error);

    res.status(500).json({
      message: "Failed to fetch incident",
    });
  }
});

// POST /api/incidents
router.post("/", async (req, res) => {
  try {
    const result = createIncidentSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        message: "Invalid incident data",
        errors: result.error.flatten().fieldErrors,
      });
      return;
    }

    const chatter = await prisma.chatter.findUnique({
      where: {
        id: result.data.chatterId,
      },
    });

    if (!chatter) {
      res.status(400).json({
        message: "Selected chatter does not exist",
      });
      return;
    }

    if (chatter.status !== "ACTIVE") {
      res.status(400).json({
        message: "Selected chatter is inactive",
      });
      return;
    }

    const rule = await prisma.rule.findUnique({
      where: {
        id: result.data.ruleId,
      },

      include: {
        versions: {
          orderBy: {
            versionNumber: "desc",
          },
          take: 1,
        },
      },
    });

    if (!rule) {
      res.status(400).json({
        message: "Selected rule does not exist",
      });
      return;
    }

    if (!rule.isActive) {
      res.status(400).json({
        message: "Selected rule is archived",
      });
      return;
    }

    const currentVersion = rule.versions[0];

    if (!currentVersion) {
      res.status(400).json({
        message: "Selected rule does not have a valid version",
      });
      return;
    }

    const incident = await prisma.incident.create({
      data: {
        chatterId: chatter.id,
        ruleVersionId: currentVersion.id,

        ruleTitleSnapshot: currentVersion.title,
        ruleDefinitionSnapshot: currentVersion.definition,

        severityNameSnapshot:
          currentVersion.severityNameSnapshot,

        weightNameSnapshot:
          currentVersion.weightNameSnapshot,

        weightValueSnapshot:
          currentVersion.weightValueSnapshot,

        occurredAt:
          result.data.occurredAt ?? new Date(),

        details: result.data.details,

        evidenceUrl:
          result.data.evidenceUrl || null,
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
            versionNumber: true,
          },
        },
      },
    });

    res.status(201).json({
      message: "Incident logged successfully",
      data: incident,
    });
  } catch (error) {
    console.error("Failed to log incident:", error);

    res.status(500).json({
      message: "Failed to log incident",
    });
  }
});

// PATCH /api/incidents/:id/resolve
router.patch("/:id/resolve", async (req, res) => {
  try {
    const result = resolveIncidentSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        message: "Invalid resolution data",
        errors: result.error.flatten().fieldErrors,
      });
      return;
    }

    const existing = await prisma.incident.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!existing) {
      res.status(404).json({
        message: "Incident not found",
      });
      return;
    }

    if (existing.status === "VOIDED") {
      res.status(409).json({
        message: "A voided incident cannot be resolved",
      });
      return;
    }

    if (existing.status === "RESOLVED") {
      res.status(409).json({
        message: "Incident is already resolved",
      });
      return;
    }

    const incident = await prisma.incident.update({
      where: {
        id: req.params.id,
      },

      data: {
        status: "RESOLVED",
        resolutionNotes:
          result.data.resolutionNotes || null,
        resolvedAt: new Date(),
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
            versionNumber: true,
          },
        },
      },
    });

    res.status(200).json({
      message: "Incident resolved successfully",
      data: incident,
    });
  } catch (error) {
    console.error("Failed to resolve incident:", error);

    res.status(500).json({
      message: "Failed to resolve incident",
    });
  }
});

// PATCH /api/incidents/:id/void
router.patch("/:id/void", async (req, res) => {
  try {
    const result = voidIncidentSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        message: "Invalid void data",
        errors: result.error.flatten().fieldErrors,
      });
      return;
    }

    const existing = await prisma.incident.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!existing) {
      res.status(404).json({
        message: "Incident not found",
      });
      return;
    }

    if (existing.status === "VOIDED") {
      res.status(409).json({
        message: "Incident is already voided",
      });
      return;
    }

    const incident = await prisma.incident.update({
      where: {
        id: req.params.id,
      },

      data: {
        status: "VOIDED",
        voidReason: result.data.reason,
        voidedAt: new Date(),
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
            versionNumber: true,
          },
        },
      },
    });

    res.status(200).json({
      message: "Incident voided successfully",
      data: incident,
    });
  } catch (error) {
    console.error("Failed to void incident:", error);

    res.status(500).json({
      message: "Failed to void incident",
    });
  }
});

export default router;