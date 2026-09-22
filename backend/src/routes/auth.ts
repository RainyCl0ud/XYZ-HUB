import {
  Router,
} from "express";

import {
  UserStatus,
} from "@prisma/client";

import {
  z,
} from "zod";

import {
  prisma,
} from "../lib/prisma.js";

import {
  type AuthenticatedRequest,
  requireAuth,
} from "../middleware/access.js";

import {
  verifyPassword,
} from "../services/password.js";

import {
  createSession,
  revokeSessionToken,
} from "../services/session.js";

import {
  clearSessionCookie,
  SESSION_COOKIE_NAME,
  setSessionCookie,
} from "../services/session-cookie.js";

import {
  createEmailTwoFactorChallenge,
  verifyTwoFactorChallenge,
} from "../services/two-factor.js";

import {
  sendEmailTwoFactorCode,
} from "../services/two-factor-delivery.js";

const router =
  Router();

/*
 * Temporary session lifetime.
 *
 * The build brief does not currently define
 * the exact lifetime, so this is centralized
 * here and can later move into configuration.
 */
const SESSION_DURATION_MS =
  7 * 24 * 60 * 60 * 1000;

/*
 * =========================================================
 * REQUEST VALIDATION
 * =========================================================
 */

const loginSchema =
  z.object({
    email:
      z
        .string()
        .trim()
        .email(),

    password:
      z
        .string()
        .min(1),
  });

const verifyTwoFactorSchema =
  z.object({
    challengeId:
      z
        .string()
        .min(1),

    code:
      z
        .string()
        .regex(
          /^\d{6}$/
        ),
  });

/*
 * =========================================================
 * POST /api/auth/login
 * =========================================================
 *
 * Verifies:
 *
 * email
 * password
 * account status
 *
 * If successful:
 *
 * create 2FA challenge
 * deliver 2FA code
 *
 * IMPORTANT:
 *
 * No authenticated session exists yet.
 */
router.post(
  "/login",
  async (
    req,
    res
  ) => {
    const parsed =
      loginSchema.safeParse(
        req.body
      );

    if (!parsed.success) {
      res.status(400).json({
        error:
          "INVALID_REQUEST",

        message:
          "A valid email and password are required.",
      });

      return;
    }

    const email =
      parsed.data.email
        .trim()
        .toLowerCase();

    const password =
      parsed.data.password;

    try {
      const user =
        await prisma.user.findFirst({
          where: {
            email: {
              equals:
                email,

              mode:
                "insensitive",
            },
          },
        });

      /*
       * Unknown email, missing password,
       * and wrong password deliberately return
       * the same response.
       *
       * This reduces account enumeration.
       */
      if (
        !user ||
        !user.passwordHash
      ) {
        res.status(401).json({
          error:
            "INVALID_CREDENTIALS",

          message:
            "Invalid email or password.",
        });

        return;
      }

      const passwordValid =
        await verifyPassword(
          password,
          user.passwordHash
        );

      if (!passwordValid) {
        res.status(401).json({
          error:
            "INVALID_CREDENTIALS",

          message:
            "Invalid email or password.",
        });

        return;
      }

      /*
       * PENDING_SETUP users have not yet
       * completed their invitation/password
       * setup.
       */
      if (
        user.status ===
        UserStatus.PENDING_SETUP
      ) {
        res.status(403).json({
          error:
            "ACCOUNT_SETUP_REQUIRED",

          message:
            "Account setup has not been completed.",
        });

        return;
      }

      if (
        user.status ===
        UserStatus.DEACTIVATED
      ) {
        res.status(403).json({
          error:
            "ACCOUNT_DEACTIVATED",

          message:
            "This account is deactivated.",
        });

        return;
      }

      /*
       * Password is correct.
       *
       * Now create the second authentication
       * factor instead of creating a session.
       */
      const {
        challenge,
        code,
      } =
        await createEmailTwoFactorChallenge(
          user.id
        );

      try {
        await sendEmailTwoFactorCode({
          email:
            user.email,

          code,

          expiresAt:
            challenge.expiresAt,
        });
      } catch (error) {
        /*
         * Never leave an active challenge
         * behind when its code could not be
         * delivered.
         */
        await prisma.twoFactorChallenge.updateMany({
          where: {
            id:
              challenge.id,

            consumedAt:
              null,
          },

          data: {
            consumedAt:
              new Date(),
          },
        });

        throw error;
      }

      /*
       * Notice that the plain 2FA code is
       * NEVER returned to the browser.
       */
      res.status(200).json({
        status:
          "TWO_FACTOR_REQUIRED",

        challengeId:
          challenge.id,

        expiresAt:
          challenge.expiresAt,
      });
    } catch (error) {
      console.error(
        "Login failed:",
        error
      );

      res.status(500).json({
        error:
          "LOGIN_FAILED",

        message:
          "Unable to complete sign-in.",
      });
    }
  }
);

/*
 * =========================================================
 * POST /api/auth/verify-2fa
 * =========================================================
 *
 * Correct code:
 *
 * challenge
 *   ↓
 * verify
 *   ↓
 * re-check account
 *   ↓
 * create session
 *   ↓
 * set secure cookie
 */
router.post(
  "/verify-2fa",
  async (
    req,
    res
  ) => {
    const parsed =
      verifyTwoFactorSchema.safeParse(
        req.body
      );

    if (!parsed.success) {
      res.status(400).json({
        error:
          "INVALID_REQUEST",

        message:
          "A challenge ID and six-digit code are required.",
      });

      return;
    }

    const {
      challengeId,
      code,
    } =
      parsed.data;

    try {
      const challenge =
        await prisma.twoFactorChallenge.findUnique({
          where: {
            id:
              challengeId,
          },

          select: {
            id: true,
            userId: true,
          },
        });

      if (!challenge) {
        res.status(401).json({
          error:
            "INVALID_TWO_FACTOR_CHALLENGE",

          message:
            "The verification code is invalid or no longer available.",
        });

        return;
      }

      const result =
        await verifyTwoFactorChallenge(
          challengeId,
          code
        );

      if (
        result ===
        "INVALID"
      ) {
        res.status(401).json({
          error:
            "INVALID_TWO_FACTOR_CODE",

          message:
            "The verification code is incorrect.",
        });

        return;
      }

      if (
        result ===
        "LOCKED"
      ) {
        res.status(429).json({
          error:
            "TWO_FACTOR_LOCKED",

          message:
            "Too many incorrect verification attempts. Sign in again to request a new code.",
        });

        return;
      }

      if (
        result ===
        "EXPIRED"
      ) {
        res.status(401).json({
          error:
            "TWO_FACTOR_EXPIRED",

          message:
            "The verification code has expired. Sign in again to request a new code.",
        });

        return;
      }

      if (
        result ===
          "CONSUMED" ||
        result ===
          "NOT_FOUND"
      ) {
        res.status(401).json({
          error:
            "INVALID_TWO_FACTOR_CHALLENGE",

          message:
            "The verification code is invalid or no longer available.",
        });

        return;
      }

      /*
       * The account is checked AGAIN after
       * successful 2FA.
       *
       * Someone could be deactivated between
       * entering their password and entering
       * their verification code.
       */
      const user =
        await prisma.user.findUnique({
          where: {
            id:
              challenge.userId,
          },
        });

      if (
        !user ||
        user.status !==
          UserStatus.ACTIVE
      ) {
        res.status(403).json({
          error:
            "ACCOUNT_UNAVAILABLE",

          message:
            "This account cannot sign in.",
        });

        return;
      }

      const expiresAt =
        new Date(
          Date.now() +
            SESSION_DURATION_MS
        );

      const {
        token,
      } =
        await createSession({
          userId:
            user.id,

          expiresAt,

          userAgent:
            req.get(
              "user-agent"
            ) ?? null,

          ipAddress:
            req.ip ?? null,
        });

      /*
       * Update the user first.
       *
       * The session cookie is only handed to
       * the browser after all required database
       * operations succeed.
       */
      await prisma.user.update({
        where: {
          id:
            user.id,
        },

        data: {
          lastSignInAt:
            new Date(),
        },
      });

      setSessionCookie(
        res,
        token,
        expiresAt
      );

      res.status(200).json({
        status:
          "AUTHENTICATED",

        user: {
          id:
            user.id,

          name:
            user.name,

          email:
            user.email,
        },
      });
    } catch (error) {
      console.error(
        "2FA verification failed:",
        error
      );

      res.status(500).json({
        error:
          "TWO_FACTOR_VERIFICATION_FAILED",

        message:
          "Unable to complete verification.",
      });
    }
  }
);

/*
 * =========================================================
 * POST /api/auth/logout
 * =========================================================
 */

router.post(
  "/logout",
  async (
    req,
    res
  ) => {
    const token =
      req.cookies?.[
        SESSION_COOKIE_NAME
      ];

    try {
      if (
        typeof token ===
          "string" &&
        token.length > 0
      ) {
        await revokeSessionToken(
          token
        );
      }
    } catch (error) {
      console.error(
        "Session revocation failed:",
        error
      );
    }

    /*
     * Logout is intentionally idempotent.
     *
     * Whether the session exists or not,
     * the browser cookie should disappear.
     */
    clearSessionCookie(
      res
    );

    res.status(200).json({
      status:
        "SIGNED_OUT",
    });
  }
);

/*
 * =========================================================
 * GET /api/auth/me
 * =========================================================
 *
 * loadSession already ran globally.
 *
 * requireAuth:
 *
 * req.userId
 *   ↓
 * roles
 * permissions
 * model assignments
 */
router.get(
  "/me",

  requireAuth,

  async (
    req: AuthenticatedRequest,
    res
  ) => {
    if (
      !req.userId ||
      !req.access
    ) {
      res.status(401).json({
        error:
          "UNAUTHENTICATED",
      });

      return;
    }

    try {
      const user =
        await prisma.user.findUnique({
          where: {
            id:
              req.userId,
          },

          select: {
            id: true,
            name: true,
            email: true,
            status: true,
            lastSignInAt: true,
          },
        });

      if (!user) {
        res.status(401).json({
          error:
            "UNAUTHENTICATED",
        });

        return;
      }

      res.status(200).json({
        user,

        access: {
          roles:
            req.access.roles,

          highestRank:
            req.access.highestRank,

          effectiveDataScope:
            req.access.effectiveDataScope,

          permissions:
            Array.from(
              req.access.permissions
            ),

          assignedModelIds:
            req.access.assignedModelIds,

          canSeeAllModels:
            req.access.canSeeAllModels,
        },
      });
    } catch (error) {
      console.error(
        "Unable to load current user:",
        error
      );

      res.status(500).json({
        error:
          "CURRENT_USER_FAILED",
      });
    }
  }
);

export default router;