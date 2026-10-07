import { Router } from "express";
import { prisma } from "../lib/prisma.js";

const router = Router();

// GET /api/dashboard/summary
router.get("/summary", async (_req, res) => {
  try {
    const [
      openIncidents,
      resolvedIncidents,
      voidedIncidents,
      totalIncidents,
      activeChatters,
      activeRules,
      recentIncidents,
    ] = await prisma.$transaction([
      prisma.incident.count({
        where: {
          status: "OPEN",
        },
      }),

      prisma.incident.count({
        where: {
          status: "RESOLVED",
        },
      }),

      prisma.incident.count({
        where: {
          status: "VOIDED",
        },
      }),

      prisma.incident.count(),

      prisma.chatter.count({
        where: {
          status: "ACTIVE",
        },
      }),

      prisma.rule.count({
        where: {
          isActive: true,
        },
      }),

      prisma.incident.findMany({
        take: 6,

        orderBy: [
          {
            occurredAt:
              "desc",
          },
          {
            id:
              "desc",
          },
        ],

        select: {
          id: true,

          ruleTitleSnapshot: true,
          severityNameSnapshot: true,
          weightNameSnapshot: true,
          weightValueSnapshot: true,

          occurredAt: true,
          status: true,

          chatter: {
            select: {
              id: true,
              name: true,
            },
          },

          ruleVersion: {
            select: {
              versionNumber: true,
            },
          },
        },
      }),
    ]);

    res.status(200).json({
      data: {
        counts: {
          openIncidents,
          resolvedIncidents,
          voidedIncidents,
          totalIncidents,
          activeChatters,
          activeRules,
        },

        recentIncidents,
      },
    });
  } catch (error) {
    console.error(
      "Failed to load dashboard summary:",
      error
    );

    res.status(500).json({
      message:
        "Failed to load dashboard summary",
    });
  }
});

export default router;
