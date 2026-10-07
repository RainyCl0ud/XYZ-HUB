import type {
  NextFunction,
  Response,
} from "express";

import type {
  AuthenticatedRequest,
} from "./access.js";

import {
  hasPermission,
} from "../services/access-control.js";

import {
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
  if (!req.access) {
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
        "You do not have access to the Quality & Incidents workspace.",
    });

    return;
  }

  next();
}


export function requireQaIncidentWrites(
  req:
    AuthenticatedRequest,
  res:
    Response,
  next:
    NextFunction
) {
  if (
    req.method === "GET" ||
    req.method === "HEAD"
  ) {
    next();
    return;
  }

  if (!req.access) {
    res.status(401).json({
      error:
        "UNAUTHENTICATED",
    });

    return;
  }

  let requiredPermission:
    string |
    null =
      null;

  if (
    req.method === "POST" &&
    (
      req.path === "/" ||
      req.path === ""
    )
  ) {
    requiredPermission =
      "quality.incidents.create";
  }
  else if (
    req.method === "PATCH" &&
    req.path.endsWith(
      "/resolve"
    )
  ) {
    requiredPermission =
      "quality.incidents.resolve";
  }
  else if (
    req.method === "PATCH" &&
    req.path.endsWith(
      "/void"
    )
  ) {
    requiredPermission =
      "quality.incidents.void";
  }

  if (
    !requiredPermission ||
    !hasPermission(
      req.access,
      requiredPermission
    )
  ) {
    res.status(403).json({
      error:
        "QA_INCIDENT_ACTION_REQUIRED",

      message:
        "You do not have permission to perform this incident action.",
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
    req.method === "GET" ||
    req.method === "HEAD"
  ) {
    next();
    return;
  }

  if (!req.access) {
    res.status(401).json({
      error:
        "UNAUTHENTICATED",
    });

    return;
  }

  const requiredPermission =
    req.baseUrl ===
      "/api/chatters"
      ? "quality.chatters.manage"
      : "quality.rules.manage";

  if (
    !hasPermission(
      req.access,
      requiredPermission
    )
  ) {
    res.status(403).json({
      error:
        "QA_CONFIGURATION_REQUIRED",

      message:
        "You do not have permission to change this Quality & Incidents configuration.",
    });

    return;
  }

  next();
}
