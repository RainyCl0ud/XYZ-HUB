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

type StrikeAuditDescriptor = {
  action:
    string;

  targetType:
    string;

  targetId:
    string |
    null;

  metadata:
    Record<
      string,
      unknown
    > |
    null;
};

function cleanPath(
  value:
    string
) {
  return value.split(
    "?",
    1
  )[0];
}

function pathParts(
  value:
    string
) {
  return cleanPath(
    value
  )
    .split(
      "/"
    )
    .filter(
      Boolean
    );
}

function stringBodyValue(
  value:
    unknown
) {
  return typeof value ===
    "string"
    ? value
    : null;
}

function describeStrikeMutation(
  req:
    AuthenticatedRequest
):
  StrikeAuditDescriptor |
  null {
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
    parts[0] !==
    "api"
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

  if (
    resource ===
    "strikes"
  ) {
    /*
     * POST /api/strikes
     *
     * /preview is deliberately not an audit mutation because
     * it changes no disciplinary state.
     */
    if (
      method ===
        "POST" &&
      !id
    ) {
      return {
        action:
          "strike.issued",

        targetType:
          "strike",

        targetId:
          null,

        metadata: {
          userId:
            stringBodyValue(
              req.body
                ?.userId
            ),

          reasonId:
            stringBodyValue(
              req.body
                ?.reasonId
            ),
        },
      };
    }

    if (
      method ===
        "POST" &&
      id &&
      operation ===
        "void"
    ) {
      return {
        action:
          "strike.voided",

        targetType:
          "strike",

        targetId:
          id,

        metadata:
          null,
      };
    }
  }

  if (
    resource ===
    "strike-reasons"
  ) {
    if (
      method ===
        "POST" &&
      !id
    ) {
      return {
        action:
          "strike.reason.created",

        targetType:
          "strike_reason",

        targetId:
          null,

        metadata: {
          requestedName:
            stringBodyValue(
              req.body
                ?.name
            ),
        },
      };
    }

    if (
      method ===
        "PATCH" &&
      id &&
      !operation
    ) {
      return {
        action:
          "strike.reason.updated",

        targetType:
          "strike_reason",

        targetId:
          id,

        metadata: {
          requestedName:
            stringBodyValue(
              req.body
                ?.name
            ),
        },
      };
    }

    if (
      method ===
        "POST" &&
      id &&
      operation ===
        "archive"
    ) {
      return {
        action:
          "strike.reason.archived",

        targetType:
          "strike_reason",

        targetId:
          id,

        metadata:
          null,
      };
    }

    if (
      method ===
        "POST" &&
      id &&
      operation ===
        "reactivate"
    ) {
      return {
        action:
          "strike.reason.reactivated",

        targetType:
          "strike_reason",

        targetId:
          id,

        metadata:
          null,
      };
    }
  }

  /*
   * Strike Ladder configuration is owned and audited by the
   * independent Strike domain.
   */
  if (
    resource ===
      "strike-ladder" &&
    method ===
      "POST"
  ) {
    return {
      action:
        "strike.ladder.version_created",

      targetType:
        "strike_ladder",

      targetId:
        null,

      metadata: {
        durationDays:
          typeof req.body
            ?.durationDays ===
            "number"
            ? req.body
                .durationDays
            : null,

        stepCount:
          Array.isArray(
            req.body
              ?.steps
          )
            ? req.body
                .steps
                .length
            : null,
      },
    };
  }

  return null;
}

export function strikeAuditHttpMiddleware(
  req:
    AuthenticatedRequest,
  res:
    Response,
  next:
    NextFunction
) {
  const descriptor =
    describeStrikeMutation(
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
      const dynamicTargetId =
        typeof res.locals
          .strikeAuditTargetId ===
          "string"
          ? res.locals
              .strikeAuditTargetId
          : null;

      void appendAuditEvent({
        action:
          descriptor.action,

        success:
          res.statusCode >=
            200 &&
          res.statusCode <
            400,

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
          dynamicTargetId ??
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
        (
          error
        ) => {
          console.error(
            "Unable to append Strike audit event:",
            error
          );
        }
      );
    }
  );

  next();
}