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
          "QA access is required to view employee disciplinary standing and QA history.",
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

    const requestedPage =
      Array.isArray(
        req.query.page
      )
        ? req.query.page[0]
        : req.query.page;
    const parsedPage =
      typeof requestedPage === "string"
        ? Number.parseInt(
            requestedPage,
            10
          )
        : 1;
    const historyPage =
      Number.isFinite(
        parsedPage
      ) &&
      parsedPage > 0
        ? parsedPage
        : 1;

    const requestedStrikePage =
      Array.isArray(
        req.query.strikePage
      )
        ? req.query.strikePage[0]
        : req.query.strikePage;

    const parsedStrikePage =
      typeof requestedStrikePage ===
        "string"
        ? Number.parseInt(
            requestedStrikePage,
            10
          )
        : 1;

    const strikeHistoryPage =
      Number.isFinite(
        parsedStrikePage
      ) &&
      parsedStrikePage > 0
        ? parsedStrikePage
        : 1;

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
          req.access,
          historyPage,
          5,
          strikeHistoryPage,
          5
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
          "Unable to load this employee's disciplinary standing and QA history.",
      });
    }
  }
);

export default router;
