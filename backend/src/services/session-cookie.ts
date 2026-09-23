import type {
  CookieOptions,
  Response,
} from "express";

export const SESSION_COOKIE_NAME =
  "xyz_session";

function getBooleanEnvironmentValue(
  value:
    string | undefined
): boolean {
  return (
    value
      ?.trim()
      .toLowerCase() ===
    "true"
  );
}

function getBaseCookieOptions(): CookieOptions {
  const configuredSameSite =
    process.env
      .SESSION_COOKIE_SAME_SITE
      ?.trim()
      .toLowerCase();

  const sameSite:
    CookieOptions["sameSite"] =
      configuredSameSite ===
      "none"
        ? "none"
        : "lax";

  /*
   * Secure is required whenever SameSite=None
   * is used by modern browsers.
   */
  const secure =
    getBooleanEnvironmentValue(
      process.env
        .SESSION_COOKIE_SECURE
    ) ||
    process.env.NODE_ENV ===
      "production" ||
    sameSite ===
      "none";

  return {
    httpOnly:
      true,

    secure,

    sameSite,

    path:
      "/",

    /*
     * IMPORTANT:
     *
     * No Domain attribute.
     *
     * The session cookie stays host-only
     * on the API service.
     */
  };
}

export function setSessionCookie(
  res:
    Response,
  token:
    string,
  expiresAt:
    Date
) {
  res.cookie(
    SESSION_COOKIE_NAME,
    token,
    {
      ...getBaseCookieOptions(),

      expires:
        expiresAt,
    }
  );
}

export function clearSessionCookie(
  res:
    Response
) {
  res.clearCookie(
    SESSION_COOKIE_NAME,
    getBaseCookieOptions()
  );
}