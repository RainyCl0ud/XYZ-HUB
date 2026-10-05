import {
  Router,
  type Response,
} from "express";

import {
  z,
} from "zod";

import {
  requirePermission,
  type AuthenticatedRequest,
} from "../middleware/access.js";

import {
  getStrike,
  getStrikeBySourceIncident,
  issueStrike,
  listEligibleStrikeTargets,
  listStrikes,
  previewStrike,
  StrikeManagementError,
  voidStrike,
} from "../services/strike-management.js";

const router =
  Router();

const httpUrlSchema =
  z
    .string()
    .trim()
    .max(
      2000
    )
    .url()
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
          "Evidence URL must use HTTP or HTTPS.",
      }
    );

const previewSchema =
  z.object({
    userId:
      z
        .string()
        .trim()
        .min(1),
  });

const issueSchema =
  z.object({
    userId:
      z
        .string()
        .trim()
        .min(1),

    reasonId:
      z
        .string()
        .trim()
        .min(1),

    details:
      z
        .string()
        .trim()
        .min(
          1,
          "Strike details are required."
        )
        .max(
          5000,
          "Strike details must be 5000 characters or fewer."
        ),

    evidenceUrl:
      httpUrlSchema
        .nullable()
        .optional(),

    sourceIncidentId:
      z
        .string()
        .trim()
        .min(1)
        .nullable()
        .optional(),
  });

const voidSchema =
  z.object({
    reason:
      z
        .string()
        .trim()
        .min(
          3,
          "Void reason must be at least 3 characters."
        )
        .max(
          2000,
          "Void reason must be 2000 characters or fewer."
        ),
  });

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

function requireAccess(
  req:
    AuthenticatedRequest,
  res:
    Response
) {
  if (
    !req.access
  ) {
    res.status(
      401
    ).json({
      error:
        "UNAUTHENTICATED",
      message:
        "Authentication is required.",
    });

    return null;
  }

  return req.access;
}

function handleStrikeError(
  error:
    unknown,
  res:
    Response
) {
  if (
    !(error instanceof
      StrikeManagementError)
  ) {
    return false;
  }

  const status =
    error.code ===
      "USER_NOT_FOUND" ||
    error.code ===
      "REASON_NOT_FOUND" ||
    error.code ===
      "STRIKE_NOT_FOUND" ||
    error.code ===
      "SOURCE_INCIDENT_NOT_FOUND"
      ? 404
      : error.code ===
          "TARGET_NOT_MANAGEABLE" ||
        error.code ===
          "STRIKE_NOT_MANAGEABLE" ||
        error.code ===
          "STRIKES_VIEW_REQUIRED" ||
        error.code ===
          "STRIKES_ISSUE_REQUIRED" ||
        error.code ===
          "STRIKES_VOID_REQUIRED"
        ? 403
        : error.code ===
            "STRIKE_ALREADY_VOIDED" ||
          error.code ===
            "SOURCE_INCIDENT_ALREADY_LINKED"
          ? 409
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

/*
 * =========================================================
 * ELIGIBLE EMPLOYEES
 * =========================================================
 */

router.get(
  "/eligible-users",

  requirePermission(
    "strikes.issue"
  ),

  async (
    req:
      AuthenticatedRequest,
    res
  ) => {
    const access =
      requireAccess(
        req,
        res
      );

    if (
      !access
    ) {
      return;
    }

    try {
      const users =
        await listEligibleStrikeTargets(
          access
        );

      res.status(
        200
      ).json({
        data:
          users,
      });
    } catch (
      error
    ) {
      if (
        handleStrikeError(
          error,
          res
        )
      ) {
        return;
      }

      console.error(
        "Failed to load eligible Strike employees:",
        error
      );

      res.status(
        500
      ).json({
        message:
          "Failed to load eligible Strike employees.",
      });
    }
  }
);

/*
 * =========================================================
 * ISSUE PREVIEW
 * =========================================================
 */

router.post(
  "/preview",

  requirePermission(
    "strikes.issue"
  ),

  async (
    req:
      AuthenticatedRequest,
    res
  ) => {
    const access =
      requireAccess(
        req,
        res
      );

    if (
      !access
    ) {
      return;
    }

    const parsed =
      previewSchema.safeParse(
        req.body
      );

    if (
      !parsed.success
    ) {
      res.status(
        400
      ).json({
        error:
          "INVALID_STRIKE_PREVIEW",
        message:
          "Invalid Strike preview request.",
        errors:
          parsed.error
            .flatten()
            .fieldErrors,
      });

      return;
    }

    try {
      const preview =
        await previewStrike(
          parsed.data.userId,
          access
        );

      res.status(
        200
      ).json({
        data:
          preview,
      });
    } catch (
      error
    ) {
      if (
        handleStrikeError(
          error,
          res
        )
      ) {
        return;
      }

      console.error(
        "Failed to preview Strike:",
        error
      );

      res.status(
        500
      ).json({
        message:
          "Failed to preview Strike.",
      });
    }
  }
);

/*
 * =========================================================
 * LIST STRIKES
 * =========================================================
 */

router.get(
  "/",

  requirePermission(
    "strikes.view"
  ),

  async (
    req:
      AuthenticatedRequest,
    res
  ) => {
    const access =
      requireAccess(
        req,
        res
      );

    if (
      !access
    ) {
      return;
    }

    try {
      const strikes =
        await listStrikes(
          access
        );

      res.status(
        200
      ).json({
        data:
          strikes,
      });
    } catch (
      error
    ) {
      if (
        handleStrikeError(
          error,
          res
        )
      ) {
        return;
      }

      console.error(
        "Failed to list Strikes:",
        error
      );

      res.status(
        500
      ).json({
        message:
          "Failed to load Strikes.",
      });
    }
  }
);

/*
 * =========================================================
 * LINKED STRIKE BY QA INCIDENT
 * =========================================================
 */

router.get(
  "/source-incident/:incidentId",

  requirePermission(
    "strikes.view"
  ),

  async (
    req:
      AuthenticatedRequest,
    res
  ) => {
    const access =
      requireAccess(
        req,
        res
      );

    if (
      !access
    ) {
      return;
    }

    const incidentId =
      getRouteParam(
        req.params.incidentId
      );

    if (
      !incidentId
    ) {
      res.status(
        400
      ).json({
        error:
          "INVALID_SOURCE_INCIDENT_ID",
        message:
          "A QA Incident ID is required.",
      });

      return;
    }

    try {
      const strike =
        await getStrikeBySourceIncident(
          incidentId,
          access
        );

      res.status(
        200
      ).json({
        data:
          strike,
      });
    } catch (
      error
    ) {
      if (
        handleStrikeError(
          error,
          res
        )
      ) {
        return;
      }

      console.error(
        "Failed to load Strike linked to QA Incident:",
        error
      );

      res.status(
        500
      ).json({
        message:
          "Failed to load linked Strike.",
      });
    }
  }
);
/*
 * =========================================================
 * ISSUE STRIKE
 * =========================================================
 */

router.post(
  "/",

  requirePermission(
    "strikes.issue"
  ),

  async (
    req:
      AuthenticatedRequest,
    res
  ) => {
    const access =
      requireAccess(
        req,
        res
      );

    if (
      !access
    ) {
      return;
    }

    const parsed =
      issueSchema.safeParse(
        req.body
      );

    if (
      !parsed.success
    ) {
      res.status(
        400
      ).json({
        error:
          "INVALID_STRIKE",
        message:
          "Invalid Strike data.",
        errors:
          parsed.error
            .flatten()
            .fieldErrors,
      });

      return;
    }

    try {
      const strike =
        await issueStrike(
          parsed.data,
          access
        );

      res.locals
        .strikeAuditTargetId =
        strike.id;

      res.status(
        201
      ).json({
        message:
          "Strike issued successfully.",
        data:
          strike,
      });
    } catch (
      error
    ) {
      if (
        handleStrikeError(
          error,
          res
        )
      ) {
        return;
      }

      console.error(
        "Failed to issue Strike:",
        error
      );

      res.status(
        500
      ).json({
        message:
          "Failed to issue Strike.",
      });
    }
  }
);

/*
 * =========================================================
 * VOID STRIKE
 * =========================================================
 */

router.post(
  "/:id/void",

  requirePermission(
    "strikes.void"
  ),

  async (
    req:
      AuthenticatedRequest,
    res
  ) => {
    const access =
      requireAccess(
        req,
        res
      );

    if (
      !access
    ) {
      return;
    }

    const strikeId =
      getRouteParam(
        req.params.id
      );

    if (
      !strikeId
    ) {
      res.status(
        400
      ).json({
        error:
          "INVALID_STRIKE_ID",
        message:
          "A Strike ID is required.",
      });

      return;
    }

    const parsed =
      voidSchema.safeParse(
        req.body
      );

    if (
      !parsed.success
    ) {
      res.status(
        400
      ).json({
        error:
          "INVALID_STRIKE_VOID",
        message:
          "Invalid Strike void request.",
        errors:
          parsed.error
            .flatten()
            .fieldErrors,
      });

      return;
    }

    try {
      const strike =
        await voidStrike(
          strikeId,
          parsed.data.reason,
          access
        );

      res.status(
        200
      ).json({
        message:
          "Strike voided successfully.",
        data:
          strike,
      });
    } catch (
      error
    ) {
      if (
        handleStrikeError(
          error,
          res
        )
      ) {
        return;
      }

      console.error(
        "Failed to void Strike:",
        error
      );

      res.status(
        500
      ).json({
        message:
          "Failed to void Strike.",
      });
    }
  }
);

/*
 * =========================================================
 * GET ONE STRIKE
 * =========================================================
 */

router.get(
  "/:id",

  requirePermission(
    "strikes.view"
  ),

  async (
    req:
      AuthenticatedRequest,
    res
  ) => {
    const access =
      requireAccess(
        req,
        res
      );

    if (
      !access
    ) {
      return;
    }

    const strikeId =
      getRouteParam(
        req.params.id
      );

    if (
      !strikeId
    ) {
      res.status(
        400
      ).json({
        error:
          "INVALID_STRIKE_ID",
        message:
          "A Strike ID is required.",
      });

      return;
    }

    try {
      const strike =
        await getStrike(
          strikeId,
          access
        );

      res.status(
        200
      ).json({
        data:
          strike,
      });
    } catch (
      error
    ) {
      if (
        handleStrikeError(
          error,
          res
        )
      ) {
        return;
      }

      console.error(
        "Failed to load Strike:",
        error
      );

      res.status(
        500
      ).json({
        message:
          "Failed to load Strike.",
      });
    }
  }
);

export default router;