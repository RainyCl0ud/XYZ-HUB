import {
  Router,
} from "express";

import {
  type AuthenticatedRequest,
  requireAuth,
} from "../middleware/access.js";

import {
  canConfigureQa,
  canViewQa,
  listAccessibleQaModels,
} from "../services/qa-access.js";

const router =
  Router();

router.get(
  "/models",

  requireAuth,

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
      res.status(200).json({
        models: [],
        canSeeAllModels:
          req.access
            .canSeeAllModels,
        canConfigureQa:
          false,
      });

      return;
    }

    const models =
      await listAccessibleQaModels(
        req.access
      );

    res.status(200).json({
      models,
      canSeeAllModels:
        req.access
          .canSeeAllModels,
      canConfigureQa:
        canConfigureQa(
          req.access
        ),
    });
  }
);

export default router;
