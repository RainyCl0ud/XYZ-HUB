import {
  Router,
} from "express";

import {
  z,
} from "zod";

import {
  acceptInviteToken,
  validateInviteToken,
} from "../services/invite.js";

const router =
  Router();

/*
 * Temporary implementation default.
 *
 * The brief does not define an exact password
 * policy yet, so this is centralized and can
 * be changed later.
 */
const PASSWORD_MIN_LENGTH =
  12;

const validateInviteSchema =
  z.object({
    token:
      z
        .string()
        .min(1),
  });

const acceptInviteSchema =
  z.object({
    token:
      z
        .string()
        .min(1),

    password:
      z
        .string()
        .min(
          PASSWORD_MIN_LENGTH
        ),
  });

/*
 * =========================================================
 * POST /api/invites/validate
 * =========================================================
 *
 * Public endpoint.
 *
 * Used by the invitation setup screen to
 * determine whether the one-time token is
 * still valid.
 */
router.post(
  "/validate",
  async (
    req,
    res
  ) => {
    const parsed =
      validateInviteSchema.safeParse(
        req.body
      );

    if (!parsed.success) {
      res.status(400).json({
        error:
          "INVALID_REQUEST",

        message:
          "An invite token is required.",
      });

      return;
    }

    try {
      const invite =
        await validateInviteToken(
          parsed.data.token
        );

      if (!invite) {
        res.status(404).json({
          error:
            "INVALID_INVITE",

          message:
            "This invitation is invalid, expired, revoked, or already used.",
        });

        return;
      }

      res.status(200).json({
        status:
          "VALID_INVITE",

        invite: {
          name:
            invite.user.name,

          email:
            invite.user.email,

          expiresAt:
            invite.expiresAt,
        },
      });
    } catch (error) {
      console.error(
        "Invite validation failed:",
        error
      );

      res.status(500).json({
        error:
          "INVITE_VALIDATION_FAILED",

        message:
          "Unable to validate invitation.",
      });
    }
  }
);

/*
 * =========================================================
 * POST /api/invites/accept
 * =========================================================
 *
 * Public endpoint.
 *
 * The invited user chooses their own password.
 *
 * XYZ Hub never sets, receives from management,
 * emails, or displays the password.
 */
router.post(
  "/accept",
  async (
    req,
    res
  ) => {
    const parsed =
      acceptInviteSchema.safeParse(
        req.body
      );

    if (!parsed.success) {
      res.status(400).json({
        error:
          "INVALID_REQUEST",

        message:
          `A valid invite token and password of at least ${PASSWORD_MIN_LENGTH} characters are required.`,
      });

      return;
    }

    try {
      const result =
        await acceptInviteToken(
          parsed.data.token,
          parsed.data.password
        );

      if (
        result.status ===
        "INVALID_INVITE"
      ) {
        res.status(400).json({
          error:
            "INVALID_INVITE",

          message:
            "This invitation is invalid, expired, revoked, or already used.",
        });

        return;
      }

      res.status(200).json({
        status:
          "ACCOUNT_ACTIVATED",

        user: {
          id:
            result.user.id,

          name:
            result.user.name,

          email:
            result.user.email,
        },

        message:
          "Account setup is complete. You may now sign in.",
      });
    } catch (error) {
      console.error(
        "Invite acceptance failed:",
        error
      );

      res.status(500).json({
        error:
          "INVITE_ACCEPTANCE_FAILED",

        message:
          "Unable to complete account setup.",
      });
    }
  }
);

export default router;