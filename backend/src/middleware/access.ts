import type {
  NextFunction,
  Request,
  Response,
} from "express";

import type {
  AccessContext,
} from "../services/access-control.js";

import {
  getAccessContext,
  hasPermission,
  isOwner,
  canAccessModel,
} from "../services/access-control.js";

export type AuthenticatedRequest =
  Request & {
    userId?: string;
    access?: AccessContext;
  };

/*
 * Temporary authentication bridge.
 *
 * For now this expects req.userId to already exist.
 * The real session/auth middleware will populate it
 * once we build the sign-in/session flow.
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.userId) {
      return res.status(401).json({
        error: "Authentication required.",
      });
    }

    const access =
      await getAccessContext(
        req.userId
      );

    req.access = access;

    next();
  } catch (error) {
    console.error(
      "Access context error:",
      error
    );

    return res.status(401).json({
      error:
        "Unable to authenticate user.",
    });
  }
}

export function requirePermission(
  permissionKey: string
) {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.access) {
      return res.status(401).json({
        error: "Authentication required.",
      });
    }

    if (
      !hasPermission(
        req.access,
        permissionKey
      )
    ) {
      return res.status(403).json({
        error:
          "You do not have permission to perform this action.",
      });
    }

    next();
  };
}

export function requireOwner(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.access) {
    return res.status(401).json({
      error: "Authentication required.",
    });
  }

  if (!isOwner(req.access)) {
    return res.status(403).json({
      error:
        "Owner access is required.",
    });
  }

  next();
}

export function requireModelAccess(
  getModelId: (
    req: AuthenticatedRequest
  ) => string | undefined
) {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.access) {
      return res.status(401).json({
        error: "Authentication required.",
      });
    }

    const modelId =
      getModelId(req);

    if (!modelId) {
      return res.status(400).json({
        error: "Model ID is required.",
      });
    }

    if (
      !canAccessModel(
        req.access,
        modelId
      )
    ) {
      return res.status(403).json({
        error:
          "You do not have access to this model.",
      });
    }

    next();
  };
}