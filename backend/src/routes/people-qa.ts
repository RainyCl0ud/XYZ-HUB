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
  getPersonDetail,
  PeopleReadError,
} from "../services/people-read.js";

import {
  getPersonQaSummary,
} from "../services/people-qa-summary.js";

import {
  canViewQa,
} from "../services/qa-access.js";

const router =
  Router();

router.get(
  "/:userId/qa",
  requireAuth,
  requirePermission(
    "people.manage"
  ),
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

    if (
      !canViewQa(
        req.access
      )
    ) {
      res.status(403).json({
        error:
          "QA_ACCESS_REQUIRED",
        message:
          "QA access is required to view employee strike standing and incident history.",
      });
      return;
    }

    const userId =
      Array.isArray(
        req.params.userId
      )
        ? req.params.userId[0]
        : req.params.userId;

    if (
      !userId
    ) {
      res.status(400).json({
        error:
          "INVALID_USER_ID",
      });
      return;
    }

    try {
      /*
       * Reuse the established People visibility rules first. This keeps
       * hierarchy, role rank, creator scope, and Owner protection intact.
       */
      await getPersonDetail(
        userId,
        req.access
      );

      const qa =
        await getPersonQaSummary(
          userId,
          req.access
        );

      res.status(200).json({
        qa,
      });
    } catch (error) {
      if (
        error instanceof
        PeopleReadError
      ) {
        if (
          error.code ===
          "USER_NOT_FOUND"
        ) {
          res.status(404).json({
            error:
              error.code,
            message:
              error.message,
          });
          return;
        }

        res.status(403).json({
          error:
            error.code,
          message:
            error.message,
        });
        return;
      }

      console.error(
        "Employee QA summary request failed:",
        error
      );

      res.status(500).json({
        error:
          "PEOPLE_QA_SUMMARY_FAILED",
        message:
          "Unable to load this employee's QA standing.",
      });
    }
  }
);

export default router;
