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

import {
  updatePersonAccess,
  PeopleAccessUpdateError,
} from "../services/people-access-update.js";

import {
  deletePerson,
  PeopleDeleteError,
} from "../services/people-delete.js";

import {
  resetPersonTwoFactor,
  PeopleTwoFactorError,
} from "../services/people-two-factor.js";

import {
  listPeople,
  getPersonDetail,
  PeopleReadError,
} from "../services/people-read.js";

import {
  getPeopleManagementOptions,
} from "../services/people-options.js";

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

    teamGroupId:
      z
        .string()
        .trim()
        .min(1)
        .optional(),
  });

  const updatePersonAccessSchema =
  z.object({
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

    teamGroupId:
      z
        .string()
        .trim()
        .min(1)
        .optional(),
  });

  const deletePersonSchema =
  z.object({
    confirmEmail:
      z
        .string()
        .trim()
        .email(),
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

/*
 * =========================================================
 * GET /api/people
 * =========================================================
 *
 * People Management list.
 */
router.get(
  "/",

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

    try {
      const people =
        await listPeople(
          req.access
        );

      res.status(200).json({
        people,
      });
    } catch (error) {
      if (
        error instanceof
        PeopleReadError
      ) {
        if (
          error.code ===
          "PEOPLE_MANAGE_REQUIRED"
        ) {
          res.status(403).json({
            error:
              error.code,

            message:
              error.message,
          });

          return;
        }
      }

      console.error(
        "List people request failed:",
        error
      );

      res.status(500).json({
        error:
          "LIST_PEOPLE_FAILED",

        message:
          "Unable to load people.",
      });
    }
  }
);


/*
 * =========================================================
 * GET /api/people/options
 * =========================================================
 *
 * Returns only roles and models the current
 * manager is allowed to assign.
 */
router.get(
  "/options",

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

    try {
      const options =
        await getPeopleManagementOptions(
          req.access
        );

      res.status(200).json(
        options
      );
    } catch (error) {
      console.error(
        "People options request failed:",
        error
      );

      res.status(500).json({
        error:
          "PEOPLE_OPTIONS_FAILED",

        message:
          "Unable to load People Management options.",
      });
    }
  }
);


/*
 * =========================================================
 * GET /api/people/:userId
 * =========================================================
 *
 * Individual People Management profile.
 */
router.get(
  "/:userId",

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
      const person =
        await getPersonDetail(
          userId,
          req.access
        );

      res.status(200).json({
        person,
      });
    } catch (error) {
      if (
        error instanceof
        PeopleReadError
      ) {
        switch (
          error.code
        ) {
          case "PEOPLE_MANAGE_REQUIRED":
          case "PERSON_NOT_VISIBLE":
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
        }
      }

      console.error(
        "Person detail request failed:",
        error
      );

      res.status(500).json({
        error:
          "PERSON_DETAIL_FAILED",

        message:
          "Unable to load the person.",
      });
    }
  }
);

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

            teamGroupId:
              parsed.data.teamGroupId,
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
         * Preserve the PENDING_SETUP user if delivery fails.
         *
         * SMTP/provider errors can be ambiguous after a message has
         * already left the application. Deleting the user here could
         * invalidate a link that was actually delivered. Revoke only
         * this invite; management can safely resend from People.
         */
        try {
          await revokeInvite(
            result.invite.id
          );
        } catch (
          cleanupError
        ) {
          console.error(
            "Failed to revoke undelivered invite:",
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
          case "TEAM_GROUP_NOT_ASSIGNABLE":
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
          case "INVALID_TEAM_GROUP":
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
          case "TEAM_GROUP_NOT_ASSIGNABLE":
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
          case "ROLE_NOT_MANAGEABLE":
          case "MODEL_NOT_MANAGEABLE":
          case "TEAM_GROUP_NOT_MANAGEABLE":
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
          case "CANNOT_DEACTIVATE_SELF":
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
          case "ROLE_NOT_MANAGEABLE":
          case "MODEL_NOT_MANAGEABLE":
          case "TEAM_GROUP_NOT_MANAGEABLE":
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

/*
 * =========================================================
 * PUT /api/people/:userId/access
 * =========================================================
 *
 * Replaces the target person's complete
 * role/model assignment set.
 */
router.put(
  "/:userId/access",

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

    const parsed =
      updatePersonAccessSchema.safeParse(
        req.body
      );

    if (!parsed.success) {
      res.status(400).json({
        error:
          "INVALID_REQUEST",

        message:
          "At least one role is required.",
      });

      return;
    }

    try {
      const user =
        await updatePersonAccess(
          {
            userId,

            roleIds:
              parsed.data.roleIds,

            modelIds:
              parsed.data.modelIds,

            teamGroupId:
              parsed.data.teamGroupId,
          },

          req.access
        );

      res.status(200).json({
        status:
          "USER_ACCESS_UPDATED",

        user,
      });
    } catch (error) {
      if (
        error instanceof
        PeopleAccessUpdateError
      ) {
        switch (
          error.code
        ) {
          case "PEOPLE_MANAGE_REQUIRED":
          case "ROLE_NOT_ASSIGNABLE":
          case "CURRENT_ROLE_NOT_MANAGEABLE":
          case "MODEL_NOT_ASSIGNABLE":
          case "CURRENT_MODEL_NOT_MANAGEABLE":
          case "CURRENT_TEAM_GROUP_NOT_MANAGEABLE":
          case "TEAM_GROUP_NOT_ASSIGNABLE":
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

          case "CANNOT_UPDATE_SELF_ACCESS":
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
          case "INVALID_TEAM_GROUP":
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
        "Update person access request failed:",
        error
      );

      res.status(500).json({
        error:
          "UPDATE_PERSON_ACCESS_FAILED",

        message:
          "Unable to update the user's access.",
      });
    }
  }
);

/*
 * =========================================================
 * DELETE /api/people/:userId
 * =========================================================
 *
 * Permanent deletion.
 *
 * Owner only.
 * Explicit email confirmation required.
 */
router.delete(
  "/:userId",

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

    const parsed =
      deletePersonSchema.safeParse(
        req.body
      );

    if (!parsed.success) {
      res.status(400).json({
        error:
          "INVALID_REQUEST",

        message:
          "The user's email is required to confirm permanent deletion.",
      });

      return;
    }

    try {
      const deleted =
        await deletePerson(
          {
            userId,

            confirmEmail:
              parsed.data
                .confirmEmail,
          },

          req.access
        );

      res.status(200).json({
        status:
          "USER_DELETED",

        user:
          deleted,
      });
    } catch (error) {
      if (
        error instanceof
        PeopleDeleteError
      ) {
        switch (
          error.code
        ) {
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

          case "CANNOT_DELETE_SELF":
          case "CONFIRMATION_MISMATCH":
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
        "Delete person request failed:",
        error
      );

      res.status(500).json({
        error:
          "DELETE_PERSON_FAILED",

        message:
          "Unable to permanently delete the user.",
      });
    }
  }
);
/*
 * =========================================================
 * POST /api/people/:userId/reset-2fa
 * =========================================================
 *
 * Owner-only security operation.
 *
 * Invalidates:
  * - outstanding 2FA challenges
  * - existing sessions
  * - future authenticator enrollment
  *
  * Email remains the default Step 1 method.
 */
router.post(
  "/:userId/reset-2fa",

  requireAuth,

  requireOwner,

  requirePermission(
    "two_factor.reset"
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
        await resetPersonTwoFactor(
          userId,
          req.access
        );

      res.status(200).json({
        status:
          "TWO_FACTOR_RESET",

        ...result,
      });
    } catch (error) {
      if (
        error instanceof
        PeopleTwoFactorError
      ) {
        switch (
          error.code
        ) {
          case "OWNER_REQUIRED":
          case "TWO_FACTOR_RESET_REQUIRED":
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
        }
      }

      console.error(
        "Reset 2FA request failed:",
        error
      );

      res.status(500).json({
        error:
          "RESET_TWO_FACTOR_FAILED",

        message:
          "Unable to reset two-factor authentication.",
      });
    }
  }
);

export default router;
