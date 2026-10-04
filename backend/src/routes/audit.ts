import {
  Router,
} from "express";

import {
  z,
} from "zod";

import {
  type AuthenticatedRequest,
  requireAuth,
  requireOwner,
} from "../middleware/access.js";

import {
  readAuditEvents,
} from "../services/audit-store.js";

import {
  presentAuditEvents,
} from "../services/audit-presentation.js";

const router =
  Router();

const querySchema =
  z.object({
    search:
      z
        .string()
        .trim()
        .max(200)
        .optional(),

    action:
      z
        .string()
        .trim()
        .max(120)
        .optional(),

    success:
      z
        .enum([
          "true",
          "false",
        ])
        .optional(),

    from:
      z
        .string()
        .datetime()
        .optional(),

    to:
      z
        .string()
        .datetime()
        .optional(),

    limit:
      z.coerce
        .number()
        .int()
        .min(1)
        .max(500)
        .optional(),
  });

router.get(
  "/",

  requireAuth,

  requireOwner,

  async (
    req:
      AuthenticatedRequest,
    res
  ) => {
    const parsed =
      querySchema.safeParse(
        req.query
      );

    if (
      !parsed.success
    ) {
      res.status(400).json({
        error:
          "INVALID_AUDIT_QUERY",

        message:
          "The audit filters are invalid.",
      });

      return;
    }

    try {
      const requestedLimit =
        parsed.data.limit ??
        200;

      const rawEvents =
        await readAuditEvents({
          action:
            parsed.data.action,

          success:
            parsed.data.success ===
              undefined
              ? undefined
              : parsed.data
                    .success ===
                  "true",

          from:
            parsed.data.from
              ? new Date(
                  parsed.data.from
                )
              : undefined,

          to:
            parsed.data.to
              ? new Date(
                  parsed.data.to
                )
              : undefined,

          limit:
            parsed.data.search
              ? 500
              : requestedLimit,
        });

      let events =
        await presentAuditEvents(
          rawEvents
        );

      const search =
        parsed.data.search
          ?.trim()
          .toLocaleLowerCase();

      if (
        search
      ) {
        events =
          events
            .filter(
              (
                event
              ) => {
                const haystack = [
                  event.action,
                  event.actionLabel,
                  event.actor.label,
                  event.actor.secondary,
                  event.target.label,
                  event.target.secondary,
                  event.summary,
                  ...event.changes.flatMap(
                    (
                      change
                    ) => [
                      change.label,
                      change.before,
                      change.after,
                    ]
                  ),
                ]
                  .filter(
                    Boolean
                  )
                  .join(
                    " "
                  )
                  .toLocaleLowerCase();

                return haystack.includes(
                  search
                );
              }
            )
            .slice(
              0,
              requestedLimit
            );
      }

      res.status(200).json({
        events,
      });
    } catch (
      error
    ) {
      console.error(
        "Unable to read audit events:",
        error
      );

      res.status(500).json({
        error:
          "AUDIT_READ_FAILED",

        message:
          "Unable to load the audit log.",
      });
    }
  }
);

export default router;
