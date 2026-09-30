import {
  Router,
} from "express";

import {
  prisma,
} from "../lib/prisma.js";

import type {
  AuthenticatedRequest,
} from "../middleware/access.js";

import {
  buildChatterModelWhere,
  buildIncidentModelWhere,
  QaAccessError,
  readRequestedModelId,
  resolveQaModelScope,
} from "../services/qa-access.js";

import {
  getStrikeActivityStatus,
} from "../services/strike-ladder.js";

const router =
  Router();

router.get(
  "/summary",
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

      const incidentWhere =
        buildIncidentModelWhere(
          scope
        );
      const chatterWhere =
        buildChatterModelWhere(
          scope
        );
      const now =
        new Date();

      const incidentSelect = {
        id: true,
        modelId: true,
        ruleTitleSnapshot: true,
        severityNameSnapshot: true,
        weightNameSnapshot: true,
        weightValueSnapshot: true,
        occurredAt: true,
        expiresAt: true,
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
        agencyModel: {
          select: {
            id: true,
            name: true,
          },
        },
      } as const;

      const [
        openIncidents,
        resolvedIncidents,
        voidedIncidents,
        totalIncidents,
        activeChatters,
        activeRules,
        recentIncidents,
        attentionIncidents,
      ] =
        await prisma.$transaction([
          prisma.incident.count({
            where: {
              ...incidentWhere,
              status: "OPEN",
            },
          }),
          prisma.incident.count({
            where: {
              ...incidentWhere,
              status: "RESOLVED",
            },
          }),
          prisma.incident.count({
            where: {
              ...incidentWhere,
              status: "VOIDED",
            },
          }),
          prisma.incident.count({
            where:
              incidentWhere,
          }),
          prisma.chatter.count({
            where: {
              ...chatterWhere,
              status: "ACTIVE",
            },
          }),
          prisma.rule.count({
            where: {
              isActive: true,
            },
          }),
          prisma.incident.findMany({
            where:
              incidentWhere,
            take: 6,
            orderBy: {
              occurredAt: "desc",
            },
            select:
              incidentSelect,
          }),
          prisma.incident.findMany({
            where: {
              ...incidentWhere,
              OR: [
                {
                  status: "OPEN",
                },
                {
                  status: {
                    not: "VOIDED",
                  },
                  expiresAt: {
                    gt: now,
                  },
                },
              ],
            },
            take: 6,
            orderBy: [
              {
                occurredAt: "desc",
              },
            ],
            select:
              incidentSelect,
          }),
        ]);

      const serializeIncident =
        <T extends (typeof recentIncidents)[number]>(
          incident: T
        ) => ({
          ...incident,
          chatter: {
            id:
              incident.chatter.id,
            name:
              incident.chatter.name,
          },
          strikeActivityStatus:
            getStrikeActivityStatus(
              incident,
              now
            ),
        });

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
          recentIncidents:
            recentIncidents.map(
              serializeIncident
            ),
          attentionIncidents:
            attentionIncidents.map(
              serializeIncident
            ),
        },
      });
    } catch (error) {
      if (
        error instanceof
        QaAccessError
      ) {
        res.status(403).json({
          error:
            error.code,
          message:
            error.message,
        });
        return;
      }

      console.error(
        "Failed to load scoped dashboard summary:",
        error
      );
      res.status(500).json({
        message:
          "Failed to load dashboard summary",
      });
    }
  }
);

export default router;
