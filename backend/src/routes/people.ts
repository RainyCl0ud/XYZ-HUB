import {
  Router,
} from "express";

import {
  z,
} from "zod";

import {
  prisma,
} from "../lib/prisma.js";

import {
  type AuthenticatedRequest,
  requireAuth,
  requireOwner,
  requirePermission,
} from "../middleware/access.js";

import {
  invitePerson,
  PeopleInviteError,
} from "../services/people-invite.js";

import {
  sendAccountInvite,
} from "../services/invite-delivery.js";

import {
  resendPersonInvite,
  ResendInviteError,
} from "../services/people-resend-invite.js";

import {
  revokeInvite,
} from "../services/invite.js";

import {
  deactivatePerson,
  reactivatePerson,
  PeopleStatusError,
} from "../services/people-status.js";

const router =
  Router();

const invitePersonSchema =
  z.object({
    name:
      z
        .string()
        .trim()
        .min(1),

    email:
      z
        .string()
        .trim()
        .email(),

    roleIds:
      z
        .array(
          z.string().min(1)
        )
        .min(1),

    modelIds:
      z
        .array(
          z.string().min(1)
        )
        .default([]),
  });

/*
 * =========================================================
 * POST /api/people/invite
 * =========================================================
 *
 * Authentication:
 *   required
 *
 * Permission:
 *   people.manage
 *
 * Business authorization is then enforced
 * again inside invitePerson():
 *
 * - role hierarchy
 * - Owner-only roles
 * - model visibility
 * - email uniqueness
 */
router.post(
  "/invite",

  requireAuth,

  requirePermission(
    "people.manage"
  ),

  async (
    req: AuthenticatedRequest,
    res
  ) => {
    const parsed =
      invitePersonSchema.safeParse(
        req.body
      );

    if (!parsed.success) {
      res.status(400).json({
        error:
          "INVALID_REQUEST",

        message:
          "Name, valid email, and at least one role are required.",
      });

      return;
    }

    if (!req.access) {
      res.status(401).json({
        error:
          "UNAUTHENTICATED",

        message:
          "Authentication is required.",
      });

      return;
    }

    try {
      const result =
        await invitePerson(
          {
            name:
              parsed.data.name,

            email:
              parsed.data.email,

            roleIds:
              parsed.data.roleIds,

            modelIds:
              parsed.data.modelIds,
          },

          req.access
        );

      /*
       * Management must never receive the
       * raw invite token through this API.
       *
       * Only the delivery adapter receives it.
       */
      try {
        await sendAccountInvite({
          name:
            result.user.name,

          email:
            result.user.email,

          token:
            result.token,

          expiresAt:
            result.invite.expiresAt,
        });
      } catch (
        deliveryError
      ) {
        /*
         * This user was created specifically
         * for this invitation.
         *
         * If delivery fails, remove the new
         * PENDING_SETUP account so management
         * can retry cleanly instead of being
         * blocked by the unique email.
         *
         * Cascading relations remove the
         * roles, model assignments and invite.
         */
        try {
          await prisma.user.delete({
            where: {
              id:
                result.user.id,
            },
          });
        } catch (
          cleanupError
        ) {
          console.error(
            "Failed to clean up undelivered invite:",
            cleanupError
          );
        }

        throw deliveryError;
      }

      res.status(201).json({
        status:
          "INVITE_SENT",

        user: {
          id:
            result.user.id,

          name:
            result.user.name,

          email:
            result.user.email,

          status:
            result.user.status,
        },

        invite: {
          expiresAt:
            result.invite.expiresAt,
        },
      });
    } catch (error) {
      if (
        error instanceof
        PeopleInviteError
      ) {
        switch (
          error.code
        ) {
          case "PEOPLE_MANAGE_REQUIRED":
          case "ROLE_NOT_ASSIGNABLE":
          case "MODEL_NOT_ASSIGNABLE":
            res.status(403).json({
              error:
                error.code,

              message:
                error.message,
            });

            return;

          case "EMAIL_IN_USE":
            res.status(409).json({
              error:
                error.code,

              message:
                error.message,
            });

            return;

          case "ROLE_REQUIRED":
          case "INVALID_ROLE":
          case "INVALID_MODEL":
            res.status(400).json({
              error:
                error.code,

              message:
                error.message,
            });

            return;
        }
      }

      console.error(
        "Invite person request failed:",
        error
      );

      res.status(500).json({
        error:
          "INVITE_PERSON_FAILED",

        message:
          "Unable to create and send the invitation.",
      });
    }
  }
);
/*
 * =========================================================
 * POST /api/people/:userId/resend-invite
 * =========================================================
 */

router.post(
  "/:userId/resend-invite",

  requireAuth,

  requirePermission(
    "people.manage"
  ),

  async (
    req: AuthenticatedRequest,
    res
  ) => {
    if (!req.access) {
      res.status(401).json({
        error:
          "UNAUTHENTICATED",
      });

      return;
    }

    const userId =
      Array.isArray(
        req.params.userId
      )
        ? req.params.userId[0]
        : req.params.userId;

    if (!userId) {
      res.status(400).json({
        error:
          "INVALID_USER_ID",
      });

      return;
    }

    try {
      const result =
        await resendPersonInvite(
          userId,
          req.access
        );

      try {
        await sendAccountInvite({
          name:
            result.user.name,

          email:
            result.user.email,

          token:
            result.token,

          expiresAt:
            result.invite.expiresAt,
        });
      } catch (deliveryError) {
        /*
         * Unlike initial creation, we do NOT
         * delete the user if resend delivery
         * fails.
         *
         * We only revoke the newly-created
         * invite.
         */
        await revokeInvite(
          result.invite.id
        );

        throw deliveryError;
      }

      res.status(200).json({
        status:
          "INVITE_RESENT",

        user: {
          id:
            result.user.id,

          name:
            result.user.name,

          email:
            result.user.email,
        },

        invite: {
          expiresAt:
            result.invite.expiresAt,
        },
      });
    } catch (error) {
      if (
        error instanceof
        ResendInviteError
      ) {
        switch (
          error.code
        ) {
          case "PEOPLE_MANAGE_REQUIRED":
          case "ROLE_NOT_ASSIGNABLE":
          case "MODEL_NOT_ASSIGNABLE":
            res.status(403).json({
              error:
                error.code,

              message:
                error.message,
            });

            return;

          case "USER_NOT_FOUND":
            res.status(404).json({
              error:
                error.code,

              message:
                error.message,
            });

            return;

          case "USER_NOT_PENDING":
            res.status(409).json({
              error:
                error.code,

              message:
                error.message,
            });

            return;
        }
      }

      console.error(
        "Resend invite request failed:",
        error
      );

      res.status(500).json({
        error:
          "RESEND_INVITE_FAILED",

        message:
          "Unable to resend the invitation.",
      });
    }
  }
);

/*
 * =========================================================
 * POST /api/people/:userId/deactivate
 * =========================================================
 */

router.post(
  "/:userId/deactivate",

  requireAuth,

  requirePermission(
    "people.deactivate"
  ),

  async (
    req: AuthenticatedRequest,
    res
  ) => {
    if (!req.access) {
      res.status(401).json({
        error:
          "UNAUTHENTICATED",
      });

      return;
    }

    const userId =
      Array.isArray(
        req.params.userId
      )
        ? req.params.userId[0]
        : req.params.userId;

    if (!userId) {
      res.status(400).json({
        error:
          "INVALID_USER_ID",
      });

      return;
    }

    try {
      const user =
        await deactivatePerson(
          userId,
          req.access
        );

      res.status(200).json({
        status:
          "USER_DEACTIVATED",

        user,
      });
    } catch (error) {
      if (
        error instanceof
        PeopleStatusError
      ) {
        switch (
          error.code
        ) {
          case "PEOPLE_DEACTIVATE_REQUIRED":
          case "ROLE_NOT_MANAGEABLE":
          case "MODEL_NOT_MANAGEABLE":
          case "OWNER_REQUIRED":
            res.status(403).json({
              error:
                error.code,

              message:
                error.message,
            });

            return;

          case "USER_NOT_FOUND":
            res.status(404).json({
              error:
                error.code,

              message:
                error.message,
            });

            return;

          case "USER_NOT_ACTIVE":
          case "USER_NOT_DEACTIVATED":
            res.status(409).json({
              error:
                error.code,

              message:
                error.message,
            });

            return;
        }
      }

      console.error(
        "Deactivate person request failed:",
        error
      );

      res.status(500).json({
        error:
          "DEACTIVATE_PERSON_FAILED",

        message:
          "Unable to deactivate the user.",
      });
    }
  }
);


/*
 * =========================================================
 * POST /api/people/:userId/reactivate
 * =========================================================
 */

router.post(
  "/:userId/reactivate",

  requireAuth,

  requireOwner,

  async (
    req: AuthenticatedRequest,
    res
  ) => {
    if (!req.access) {
      res.status(401).json({
        error:
          "UNAUTHENTICATED",
      });

      return;
    }

    const userId =
      Array.isArray(
        req.params.userId
      )
        ? req.params.userId[0]
        : req.params.userId;

    if (!userId) {
      res.status(400).json({
        error:
          "INVALID_USER_ID",
      });

      return;
    }

    try {
      const user =
        await reactivatePerson(
          userId,
          req.access
        );

      res.status(200).json({
        status:
          "USER_REACTIVATED",

        user,
      });
    } catch (error) {
      if (
        error instanceof
        PeopleStatusError
      ) {
        switch (
          error.code
        ) {
          case "OWNER_REQUIRED":
          case "PEOPLE_DEACTIVATE_REQUIRED":
          case "ROLE_NOT_MANAGEABLE":
          case "MODEL_NOT_MANAGEABLE":
            res.status(403).json({
              error:
                error.code,

              message:
                error.message,
            });

            return;

          case "USER_NOT_FOUND":
            res.status(404).json({
              error:
                error.code,

              message:
                error.message,
            });

            return;

          case "USER_NOT_ACTIVE":
          case "USER_NOT_DEACTIVATED":
            res.status(409).json({
              error:
                error.code,

              message:
                error.message,
            });

            return;
        }
      }

      console.error(
        "Reactivate person request failed:",
        error
      );

      res.status(500).json({
        error:
          "REACTIVATE_PERSON_FAILED",

        message:
          "Unable to reactivate the user.",
      });
    }
  }
);

export default router;