import type {
  NextFunction,
  Request,
  Response,
} from "express";

import {
  validateSessionToken,
} from "../services/session.js";

import {
  clearSessionCookie,
  SESSION_COOKIE_NAME,
} from "../services/session-cookie.js";

export type SessionAuthenticatedRequest =
  Request & {
    userId?: string;
    sessionId?: string;
  };

/*
 * Reads the browser's session cookie.
 *
 * If the token represents a valid,
 * active session:
 *
 * req.userId
 * req.sessionId
 *
 * are populated for later middleware.
 *
 * Missing/invalid sessions do not
 * automatically return 401 here.
 *
 * requireAuth is responsible for
 * deciding whether a specific route
 * requires authentication.
 */
export async function loadSession(
  req: SessionAuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const token =
    req.cookies?.[
      SESSION_COOKIE_NAME
    ];

  if (
    typeof token !== "string" ||
    token.length === 0
  ) {
    next();

    return;
  }

  try {
    const session =
      await validateSessionToken(
        token
      );

    if (!session) {
      clearSessionCookie(res);

      next();

      return;
    }

    req.userId =
      session.userId;

    req.sessionId =
      session.id;

    next();
  } catch (error) {
    console.error(
      "Session authentication error:",
      error
    );

    clearSessionCookie(res);

    next();
  }
}