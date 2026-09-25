import {
  Router,
} from "express";

import {
  z,
} from "zod";

import {
  type AuthenticatedRequest,
  requireAuth,
} from "../middleware/access.js";

import {
  readAuditEvents,
} from "../services/audit-store.js";

const router =
  Router();

function canReadAudit(
  req:
    AuthenticatedRequest
) {
  return (
    req.access?.roles.some(
      (
        role
      ) =>
        role.systemKey ===
          "OWNER" ||
        role.systemKey ===
          "DEV"
    ) ??
    false
  );
}

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

  async (
    req:
      AuthenticatedRequest,
    res
  ) => {
    if (
      !canReadAudit(
        req
      )
    ) {
      res.status(403).json({
        error:
          "AUDIT_VIEW_REQUIRED",

        message:
          "Audit Log access is limited to Owner and Dev.",
      });

      return;
    }

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
      const events =
        await readAuditEvents({
          search:
            parsed.data.search,

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
            parsed.data.limit,
        });

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
