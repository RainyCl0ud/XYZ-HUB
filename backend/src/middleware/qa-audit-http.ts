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

type QaAuditDescriptor = {
  action: string;
  targetType: string;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
};

function cleanPath(
  value: string
) {
  return value.split(
    "?",
    1
  )[0];
}

function pathParts(
  value: string
) {
  return cleanPath(
    value
  )
    .split("/")
    .filter(Boolean);
}

function safeRequestedMetadata(
  req: AuthenticatedRequest
) {
  const body =
    req.body &&
    typeof req.body === "object"
      ? req.body as Record<string, unknown>
      : {};

  return {
    chatterId:
      typeof body.chatterId === "string"
        ? body.chatterId
        : null,
    ruleId:
      typeof body.ruleId === "string"
        ? body.ruleId
        : null,
    name:
      typeof body.name === "string"
        ? body.name
        : null,
    title:
      typeof body.title === "string"
        ? body.title
        : null,
    orderedIds:
      Array.isArray(body.orderedIds)
        ? body.orderedIds.filter(
            (value): value is string =>
              typeof value === "string"
          )
        : undefined,
  };
}

function describeQaMutation(
  req: AuthenticatedRequest
): QaAuditDescriptor | null {
  const method =
    req.method.toUpperCase();

  if (
    method !== "POST" &&
    method !== "PATCH" &&
    method !== "PUT" &&
    method !== "DELETE"
  ) {
    return null;
  }

  const parts =
    pathParts(
      req.originalUrl
    );

  if (
    parts[0] !== "api"
  ) {
    return null;
  }

  const resource =
    parts[1];
  const id =
    parts[2] ??
    null;
  const operation =
    parts[3] ??
    null;
  const requested =
    safeRequestedMetadata(
      req
    );

  if (
    resource === "severity-options"
  ) {
    if (
      method === "POST" &&
      !id
    ) {
      return {
        action:
          "qa.severity.created",
        targetType:
          "severity_option",
        targetId:
          null,
        metadata: {
          requested,
        },
      };
    }

    if (
      method === "PATCH" &&
      id === "reorder"
    ) {
      return {
        action:
          "qa.severity.reordered",
        targetType:
          "severity_option",
        targetId:
          null,
        metadata: {
          requested,
        },
      };
    }

    if (
      method === "PATCH" &&
      id
    ) {
      return {
        action:
          operation === "archive"
            ? "qa.severity.archived"
            : operation === "reactivate"
              ? "qa.severity.reactivated"
              : "qa.severity.updated",
        targetType:
          "severity_option",
        targetId:
          id,
        metadata:
          operation
            ? null
            : {
                requested,
              },
      };
    }
  }

  if (
    resource === "weight-options"
  ) {
    if (
      method === "POST" &&
      !id
    ) {
      return {
        action:
          "qa.weight.created",
        targetType:
          "weight_option",
        targetId:
          null,
        metadata: {
          requested,
        },
      };
    }

    if (
      method === "PATCH" &&
      id === "reorder"
    ) {
      return {
        action:
          "qa.weight.reordered",
        targetType:
          "weight_option",
        targetId:
          null,
        metadata: {
          requested,
        },
      };
    }

    if (
      method === "PATCH" &&
      id
    ) {
      return {
        action:
          operation === "archive"
            ? "qa.weight.archived"
            : operation === "reactivate"
              ? "qa.weight.reactivated"
              : "qa.weight.updated",
        targetType:
          "weight_option",
        targetId:
          id,
        metadata:
          operation
            ? null
            : {
                requested,
              },
      };
    }
  }

  if (
    resource === "rules"
  ) {
    if (
      method === "POST" &&
      !id
    ) {
      return {
        action:
          "qa.rule.created",
        targetType:
          "qa_rule",
        targetId:
          null,
        metadata: {
          requested,
        },
      };
    }

    if (
      method === "PATCH" &&
      id
    ) {
      return {
        action:
          operation === "archive"
            ? "qa.rule.archived"
            : operation === "reactivate"
              ? "qa.rule.reactivated"
              : "qa.rule.version_created",
        targetType:
          "qa_rule",
        targetId:
          id,
        metadata:
          operation
            ? null
            : {
                requested,
              },
      };
    }
  }


  if (
    resource === "incidents"
  ) {
    if (
      method === "POST" &&
      !id
    ) {
      return {
        action:
          "qa.incident.logged",
        targetType:
          "incident",
        targetId:
          null,
        metadata: {
          chatterId:
            requested.chatterId,
          ruleId:
            requested.ruleId,
        },
      };
    }

    if (
      method === "PATCH" &&
      id &&
      operation
    ) {
      return {
        action:
          operation === "resolve"
            ? "qa.incident.resolved"
            : operation === "void"
              ? "qa.incident.voided"
              : "qa.incident.updated",
        targetType:
          "incident",
        targetId:
          id,
        metadata:
          null,
      };
    }
  }

  if (
    resource === "chatters"
  ) {
    if (
      method === "POST" &&
      !id
    ) {
      return {
        action:
          "qa.chatter.created",
        targetType:
          "chatter",
        targetId:
          null,
        metadata: {
          requested,
        },
      };
    }

    if (
      method === "PATCH" &&
      id
    ) {
      return {
        action:
          operation === "deactivate"
            ? "qa.chatter.deactivated"
            : operation === "reactivate"
              ? "qa.chatter.reactivated"
              : "qa.chatter.updated",
        targetType:
          "chatter",
        targetId:
          id,
        metadata:
          operation
            ? null
            : {
                requested,
              },
      };
    }
  }

  return null;
}

/**
 * Append-only audit coverage for QA mutations. The existing management
 * audit middleware intentionally handles identity/access resources; this
 * middleware fills the QA gap without recording ordinary reads.
 */
export function qaAuditHttpMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const descriptor =
    describeQaMutation(
      req
    );

  if (
    !descriptor
  ) {
    next();
    return;
  }

  res.on(
    "finish",
    () => {
      void appendAuditEvent({
        action:
          descriptor.action,
        success:
          res.statusCode >= 200 &&
          res.statusCode < 400,
        statusCode:
          res.statusCode,
        actorUserId:
          req.userId ??
          null,
        actorLabel:
          null,
        targetType:
          descriptor.targetType,
        targetId:
          descriptor.targetId,
        ipAddress:
          req.ip ??
          null,
        userAgent:
          req.get(
            "user-agent"
          ) ??
          null,
        metadata:
          descriptor.metadata,
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

  next();
}
