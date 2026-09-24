import type {
  NextFunction,
  Response,
} from "express";

import type {
  AuthenticatedRequest,
} from "./access.js";

import {
  canConfigureQa,
  canViewQa,
} from "../services/qa-access.js";

export function requireQaView(
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
        "You do not have access to the QA workspace.",
    });

    return;
  }

  next();
}

export function requireQaConfigurationForWrites(
  req:
    AuthenticatedRequest,
  res:
    Response,
  next:
    NextFunction
) {
  if (
    req.method ===
      "GET" ||
    req.method ===
      "HEAD"
  ) {
    next();

    return;
  }

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
    !canConfigureQa(
      req.access
    )
  ) {
    res.status(403).json({
      error:
        "QA_CONFIGURATION_REQUIRED",

      message:
        "You do not have permission to change QA configuration.",
    });

    return;
  }

  next();
}
