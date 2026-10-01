import {
  Router,
} from "express";

import type {
  AuthenticatedRequest,
} from "../middleware/access.js";

import {
  requireAuth,
  requirePermission,
} from "../middleware/access.js";

import {
  prisma,
} from "../lib/prisma.js";

import {
  getPersonDetail,
  PeopleReadError,
} from "../services/people-read.js";

import {
  getCurrentStrikeLadder,
  getStrikeLadderState,
} from "../services/strike-ladder.js";

const router =
  Router();

router.get(
  "/:userId/qa-standing",
  requireAuth,
  requirePermission(
    "people.manage"
  ),
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    if (!req.access) {
      res.status(401).json({
        error: "UNAUTHENTICATED",
      });
      return;
    }

    const userId =
      Array.isArray(
        req.params.userId
      )
        ? req.params.userId[0]
        : req.params.userId;

    if (!userId) {
      res.status(400).json({
        error: "INVALID_USER_ID",
      });
      return;
    }

    try {
      /*
       * Reuse People Management visibility authorization before exposing
       * QA standing. This prevents the summary from becoming a shortcut
       * around organization / role / creator scope.
       */
      const person =
        await getPersonDetail(
          userId,
          req.access
        );

      const chatter =
        await prisma.chatter.findUnique({
          where: {
            userId,
          },
          select: {
            id: true,
            status: true,
          },
        });

      if (!chatter) {
        res.status(200).json({
          userId: person.id,
          chatterId: null,
          standing: null,
        });
        return;
      }

      const now =
        new Date();

      const incidents =
        await prisma.incident.findMany({
          where: {
            chatterId:
              chatter.id,
            status: {
              not: "VOIDED",
            },
            expiresAt: {
              gt: now,
            },
            ...(req.access.canSeeAllModels
              ? {}
              : {
                  modelId: {
                    in:
                      req.access
                        .assignedModelIds,
                  },
                }),
          },
          select: {
            expiresAt: true,
          },
          orderBy: {
            expiresAt:
              "asc",
          },
        });

      const ladder =
        await getCurrentStrikeLadder();

      const state =
        getStrikeLadderState(
          incidents.length,
          ladder.steps.map(
            (step) => ({
              minActiveStrikes:
                step.minActiveStrikes,
              standingLabel:
                step.standingLabel,
              deductionPercent:
                step.deductionPercent,
            })
        );

      res.status(200).json({
        userId: person.id,
        chatterId:
          chatter.id,
        chatterStatus:
          chatter.status,
        standing: {
          activeStrikeCount:
            state.activeStrikeCount,
          standingLabel:
            state.standingLabel,
          deductionPercent:
            state.commissionDeductionPercent,
          nextExpiryAt:
            incidents[0]
              ?.expiresAt ??
            null,
          ladderVersion:
            ladder.versionNumber,
        },
      });
    } catch (error) {
      if (
        error instanceof
        PeopleReadError
      ) {
        const status =
          error.code ===
            "USER_NOT_FOUND"
            ? 404
            : 403;

        res.status(status).json({
          error: error.code,
          message: error.message,
        });
        return;
      }

      console.error(
        "Employee QA standing request failed:",
        error
      );

      res.status(500).json({
        error:
          "EMPLOYEE_QA_STANDING_FAILED",
        message:
          "Unable to load the employee's QA standing.",
      });
    }
  }
);

export default router;
