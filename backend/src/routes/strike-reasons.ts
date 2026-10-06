import {
  Router,
  type NextFunction,
  type Response,
} from "express";

import {
  z,
} from "zod";

import {
  hasPermission,
} from "../services/access-control.js";

import {
  requirePermission,
  type AuthenticatedRequest,
} from "../middleware/access.js";

import {
  archiveStrikeReason,
  createStrikeReason,
  listActiveStrikeReasons,
  listManagedStrikeReasons,
  reactivateStrikeReason,
  StrikeReasonError,
  updateStrikeReason,
} from "../services/strike-reasons.js";

const router =
  Router();

const reasonPayloadSchema =
  z.object({
    name:
      z
        .string()
        .trim()
        .min(
          1,
          "Strike reason name is required."
        )
        .max(
          120,
          "Strike reason name must be 120 characters or fewer."
        ),

    description:
      z
        .string()
        .trim()
        .max(
          1000,
          "Strike reason description must be 1000 characters or fewer."
        )
        .nullable()
        .optional(),
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

function requireStrikeReasonRead(
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
    res.status(
      401
    ).json({
      error:
        "UNAUTHENTICATED",
    });

    return;
  }

  if (
    !hasPermission(
      req.access,
      "strikes.issue"
    ) &&
    !hasPermission(
      req.access,
      "strikes.configure"
    )
  ) {
    res.status(
      403
    ).json({
      error:
        "STRIKE_REASON_ACCESS_REQUIRED",
      message:
        "You do not have permission to view Strike reasons.",
    });

    return;
  }

  next();
}

function handleReasonError(
  error:
    unknown,
  res:
    Response
) {
  if (
    !(error instanceof
      StrikeReasonError)
  ) {
    return false;
  }

  const status =
    error.code ===
      "REASON_NOT_FOUND"
      ? 404
      : error.code ===
          "REASON_NAME_IN_USE"
        ? 409
        : 403;

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

  requireStrikeReasonRead,

  async (
    req:
      AuthenticatedRequest,
    res
  ) => {
    try {
      const reasons =
        await listActiveStrikeReasons(
          req.access!
        );

      res.status(
        200
      ).json({
        data:
          reasons,
      });
    } catch (
      error
    ) {
      if (
        handleReasonError(
          error,
          res
        )
      ) {
        return;
      }

      console.error(
        "Failed to load active Strike reasons:",
        error
      );

      res.status(
        500
      ).json({
        message:
          "Failed to load Strike reasons.",
      });
    }
  }
);

router.get(
  "/manage",

  requirePermission(
    "strikes.configure"
  ),

  async (
    req:
      AuthenticatedRequest,
    res
  ) => {
    try {
      const reasons =
        await listManagedStrikeReasons(
          req.access!
        );

      res.status(
        200
      ).json({
        data:
          reasons,
      });
    } catch (
      error
    ) {
      if (
        handleReasonError(
          error,
          res
        )
      ) {
        return;
      }

      console.error(
        "Failed to load managed Strike reasons:",
        error
      );

      res.status(
        500
      ).json({
        message:
          "Failed to load Strike reason management.",
      });
    }
  }
);

router.post(
  "/",

  requirePermission(
    "strikes.configure"
  ),

  async (
    req:
      AuthenticatedRequest,
    res
  ) => {
    const parsed =
      reasonPayloadSchema.safeParse(
        req.body
      );

    if (
      !parsed.success
    ) {
      res.status(
        400
      ).json({
        error:
          "INVALID_STRIKE_REASON",
        message:
          "Invalid Strike reason.",
        errors:
          parsed.error
            .flatten()
            .fieldErrors,
      });

      return;
    }

    try {
      const reason =
        await createStrikeReason(
          parsed.data,
          req.access!
        );

      res.locals
        .strikeAuditTargetId =
        reason.id;

      res.status(
        201
      ).json({
        message:
          "Strike reason created successfully.",
        data:
          reason,
      });
    } catch (
      error
    ) {
      if (
        handleReasonError(
          error,
          res
        )
      ) {
        return;
      }

      console.error(
        "Failed to create Strike reason:",
        error
      );

      res.status(
        500
      ).json({
        message:
          "Failed to create Strike reason.",
      });
    }
  }
);

router.patch(
  "/:id",

  requirePermission(
    "strikes.configure"
  ),

  async (
    req:
      AuthenticatedRequest,
    res
  ) => {
    const reasonId =
      getRouteParam(
        req.params.id
      );

    if (
      !reasonId
    ) {
      res.status(
        400
      ).json({
        error:
          "INVALID_STRIKE_REASON_ID",
      });

      return;
    }

    const parsed =
      reasonPayloadSchema.safeParse(
        req.body
      );

    if (
      !parsed.success
    ) {
      res.status(
        400
      ).json({
        error:
          "INVALID_STRIKE_REASON",
        message:
          "Invalid Strike reason.",
        errors:
          parsed.error
            .flatten()
            .fieldErrors,
      });

      return;
    }

    try {
      const reason =
        await updateStrikeReason(
          reasonId,
          parsed.data,
          req.access!
        );

      res.status(
        200
      ).json({
        message:
          "Strike reason updated successfully.",
        data:
          reason,
      });
    } catch (
      error
    ) {
      if (
        handleReasonError(
          error,
          res
        )
      ) {
        return;
      }

      console.error(
        "Failed to update Strike reason:",
        error
      );

      res.status(
        500
      ).json({
        message:
          "Failed to update Strike reason.",
      });
    }
  }
);

router.post(
  "/:id/archive",

  requirePermission(
    "strikes.configure"
  ),

  async (
    req:
      AuthenticatedRequest,
    res
  ) => {
    const reasonId =
      getRouteParam(
        req.params.id
      );

    if (
      !reasonId
    ) {
      res.status(
        400
      ).json({
        error:
          "INVALID_STRIKE_REASON_ID",
      });

      return;
    }

    try {
      const reason =
        await archiveStrikeReason(
          reasonId,
          req.access!
        );

      res.status(
        200
      ).json({
        message:
          "Strike reason archived successfully.",
        data:
          reason,
      });
    } catch (
      error
    ) {
      if (
        handleReasonError(
          error,
          res
        )
      ) {
        return;
      }

      console.error(
        "Failed to archive Strike reason:",
        error
      );

      res.status(
        500
      ).json({
        message:
          "Failed to archive Strike reason.",
      });
    }
  }
);

router.post(
  "/:id/reactivate",

  requirePermission(
    "strikes.configure"
  ),

  async (
    req:
      AuthenticatedRequest,
    res
  ) => {
    const reasonId =
      getRouteParam(
        req.params.id
      );

    if (
      !reasonId
    ) {
      res.status(
        400
      ).json({
        error:
          "INVALID_STRIKE_REASON_ID",
      });

      return;
    }

    try {
      const reason =
        await reactivateStrikeReason(
          reasonId,
          req.access!
        );

      res.status(
        200
      ).json({
        message:
          "Strike reason reactivated successfully.",
        data:
          reason,
      });
    } catch (
      error
    ) {
      if (
        handleReasonError(
          error,
          res
        )
      ) {
        return;
      }

      console.error(
        "Failed to reactivate Strike reason:",
        error
      );

      res.status(
        500
      ).json({
        message:
          "Failed to reactivate Strike reason.",
      });
    }
  }
);

export default router;