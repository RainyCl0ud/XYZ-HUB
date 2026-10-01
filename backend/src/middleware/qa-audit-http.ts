import type {
  NextFunction,
  Response,
} from "express";

import type {
  AuthenticatedRequest,
} from "./access.js";

import {
  appendAuditEvent,
} from "../services/audit-store.js";

type QaAuditPreparation = {
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
};

function cleanPath(
  originalUrl: string
) {
  return originalUrl.split("?", 1)[0];
}

function routeId(
  path: string,
  prefix: string
) {
  if (!path.startsWith(prefix)) {
    return null;
  }

  const remainder =
    path.slice(prefix.length);

  if (!remainder) {
    return null;
  }

  return decodeURIComponent(
    remainder.split("/", 1)[0]
  );
}

function optionMetadata(
  body: unknown
) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    return null;
  }

  const record =
    body as Record<string, unknown>;

  const name =
    typeof record.name === "string"
      ? record.name
      : null;

  const description =
    typeof record.description === "string"
      ? record.description
      : null;

  return {
    ...(name
      ? {
          targetLabel: name,
        }
      : {}),
    ...(typeof record.value === "number"
      ? {
          value: record.value,
        }
      : {}),
    ...(description !== null
      ? {
          descriptionLength:
            description.length,
        }
      : {}),
  };
}

function ruleMetadata(
  body: unknown
) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    return null;
  }

  const record =
    body as Record<string, unknown>;

  return {
    targetLabel:
      typeof record.title === "string"
        ? record.title
        : undefined,
    severityOptionId:
      typeof record.severityOptionId === "string"
        ? record.severityOptionId
        : null,
    weightOptionId:
      typeof record.weightOptionId === "string"
        ? record.weightOptionId
        : null,
    definitionLength:
      typeof record.definition === "string"
        ? record.definition.length
        : null,
  };
}

function prepareQaAudit(
  req: AuthenticatedRequest
): QaAuditPreparation | null {
  const method =
    req.method.toUpperCase();
  const path =
    cleanPath(
      req.originalUrl
    );

  if (
    path === "/api/severity-options" &&
    method === "POST"
  ) {
    return {
      action: "qa.severity.created",
      targetType: "severity_option",
      targetId: null,
      metadata:
        optionMetadata(req.body),
    };
  }

  if (
    path === "/api/severity-options/reorder" &&
    method === "PATCH"
  ) {
    const orderedIds =
      Array.isArray(
        req.body?.orderedIds
      )
        ? req.body.orderedIds
        : [];

    return {
      action: "qa.severity.reordered",
      targetType:
        "severity_options",
      targetId: null,
      metadata: {
        optionCount:
          orderedIds.length,
      },
    };
  }

  const severityId =
    routeId(
      path,
      "/api/severity-options/"
    );

  if (
    severityId &&
    method === "PATCH"
  ) {
    return {
      action:
        path.endsWith("/archive")
          ? "qa.severity.archived"
          : path.endsWith("/reactivate")
            ? "qa.severity.reactivated"
            : "qa.severity.updated",
      targetType:
        "severity_option",
      targetId:
        severityId,
      metadata:
        optionMetadata(req.body),
    };
  }

  if (
    path === "/api/weight-options" &&
    method === "POST"
  ) {
    return {
      action: "qa.weight.created",
      targetType: "weight_option",
      targetId: null,
      metadata:
        optionMetadata(req.body),
    };
  }

  if (
    path === "/api/weight-options/reorder" &&
    method === "PATCH"
  ) {
    const orderedIds =
      Array.isArray(
        req.body?.orderedIds
      )
        ? req.body.orderedIds
        : [];

    return {
      action: "qa.weight.reordered",
      targetType:
        "weight_options",
      targetId: null,
      metadata: {
        optionCount:
          orderedIds.length,
      },
    };
  }

  const weightId =
    routeId(
      path,
      "/api/weight-options/"
    );

  if (
    weightId &&
    method === "PATCH"
  ) {
    return {
      action:
        path.endsWith("/archive")
          ? "qa.weight.archived"
          : path.endsWith("/reactivate")
            ? "qa.weight.reactivated"
            : "qa.weight.updated",
      targetType:
        "weight_option",
      targetId:
        weightId,
      metadata:
        optionMetadata(req.body),
    };
  }

  if (
    path === "/api/rules" &&
    method === "POST"
  ) {
    return {
      action: "qa.rule.created",
      targetType: "rule",
      targetId: null,
      metadata:
        ruleMetadata(req.body),
    };
  }

  const ruleId =
    routeId(
      path,
      "/api/rules/"
    );

  if (
    ruleId &&
    method === "PATCH"
  ) {
    return {
      action:
        path.endsWith("/archive")
          ? "qa.rule.archived"
          : path.endsWith("/reactivate")
            ? "qa.rule.reactivated"
            : "qa.rule.version_created",
      targetType: "rule",
      targetId: ruleId,
      metadata:
        ruleMetadata(req.body),
    };
  }

  if (
    path === "/api/incidents" &&
    method === "POST"
  ) {
    const body =
      req.body &&
      typeof req.body === "object" &&
      !Array.isArray(req.body)
        ? req.body as Record<string, unknown>
        : {};

    return {
      action: "qa.incident.created",
      targetType: "incident",
      targetId: null,
      metadata: {
        chatterId:
          typeof body.chatterId === "string"
            ? body.chatterId
            : null,
        ruleId:
          typeof body.ruleId === "string"
            ? body.ruleId
            : null,
        evidenceIncluded:
          typeof body.evidenceUrl === "string" &&
          body.evidenceUrl.length > 0,
        detailsLength:
          typeof body.details === "string"
            ? body.details.length
            : null,
      },
    };
  }

  const incidentId =
    routeId(
      path,
      "/api/incidents/"
    );

  if (
    incidentId &&
    method === "PATCH" &&
    (
      path.endsWith("/resolve") ||
      path.endsWith("/void")
    )
  ) {
    return {
      action:
        path.endsWith("/resolve")
          ? "qa.incident.resolved"
          : "qa.incident.voided",
      targetType: "incident",
      targetId: incidentId,
      metadata: null,
    };
  }

  if (
    path === "/api/strike-ladder" &&
    method === "POST"
  ) {
    const body =
      req.body &&
      typeof req.body === "object" &&
      !Array.isArray(req.body)
        ? req.body as Record<string, unknown>
        : {};

    return {
      action:
        "qa.strike_ladder.version_created",
      targetType:
        "strike_ladder",
      targetId: null,
      metadata: {
        durationDays:
          typeof body.durationDays === "number"
            ? body.durationDays
            : null,
        stepCount:
          Array.isArray(body.steps)
            ? body.steps.length
            : null,
      },
    };
  }

  if (
    path === "/api/chatters" &&
    method === "POST"
  ) {
    return {
      action: "qa.chatter.created",
      targetType: "chatter",
      targetId: null,
      metadata:
        optionMetadata(req.body),
    };
  }

  const chatterId =
    routeId(
      path,
      "/api/chatters/"
    );

  if (
    chatterId &&
    method === "PATCH"
  ) {
    return {
      action:
        path.endsWith("/deactivate")
          ? "qa.chatter.deactivated"
          : path.endsWith("/reactivate")
            ? "qa.chatter.reactivated"
            : "qa.chatter.updated",
      targetType: "chatter",
      targetId: chatterId,
      metadata:
        optionMetadata(req.body),
    };
  }

  return null;
}

export function qaAuditHttpMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const prepared =
    prepareQaAudit(req);

  if (prepared) {
    res.once(
      "finish",
      () => {
        void appendAuditEvent({
          action:
            prepared.action,
          success:
            res.statusCode >= 200 &&
            res.statusCode < 400,
          statusCode:
            res.statusCode,
          actorUserId:
            req.userId ?? null,
          actorLabel:
            null,
          targetType:
            prepared.targetType,
          targetId:
            prepared.targetId,
          ipAddress:
            req.ip ?? null,
          userAgent:
            req.get(
              "user-agent"
            ) ?? null,
          metadata:
            prepared.metadata,
        }).catch(
          (error) => {
            console.error(
              "Unable to append QA audit event:",
              error
            );
          }
        );
      }
    );
  }

  next();
}
