import type {
  CookieOptions,
  Response,
} from "express";

export const SESSION_COOKIE_NAME =
  "xyz_session";

function getBaseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,

    /*
     * Railway staging/production uses HTTPS.
     *
     * Local development normally runs over HTTP,
     * so Secure must be disabled locally.
     */
    secure:
      process.env.NODE_ENV ===
      "production",

    sameSite: "lax",

    path: "/",

    /*
     * IMPORTANT:
     *
     * Do not add a Domain attribute.
     *
     * This keeps the cookie host-only,
     * exactly as required by the build brief.
     */
  };
}

export function setSessionCookie(
  res: Response,
  token: string,
  expiresAt: Date
) {
  res.cookie(
    SESSION_COOKIE_NAME,
    token,
    {
      ...getBaseCookieOptions(),

      expires: expiresAt,
    }
  );
}

export function clearSessionCookie(
  res: Response
) {
  res.clearCookie(
    SESSION_COOKIE_NAME,
    getBaseCookieOptions()
  );
}