import type {
  NextFunction,
  Request,
  Response,
} from "express";

type RateLimitOptions = {
  windowMs: number;
  max: number;
  keyPrefix: string;
  getIdentity?: (
    req: Request
  ) => string;
};

type Bucket = {
  count: number;
  resetAt: number;
};

export function createRateLimit(
  options:
    RateLimitOptions
) {
  const buckets =
    new Map<
      string,
      Bucket
    >();

  let lastCleanup =
    0;

  return (
    req:
      Request,
    res:
      Response,
    next:
      NextFunction
  ) => {
    const now =
      Date.now();

    if (
      now -
        lastCleanup >
      options.windowMs
    ) {
      lastCleanup =
        now;

      for (
        const [
          key,
          bucket,
        ]
        of buckets
      ) {
        if (
          bucket.resetAt <=
          now
        ) {
          buckets.delete(
            key
          );
        }
      }
    }

    const identity =
      options.getIdentity?.(
        req
      ) ??
      req.ip ??
      "unknown";

    const key =
      `${options.keyPrefix}:${identity}`;

    const current =
      buckets.get(
        key
      );

    const bucket =
      !current ||
      current.resetAt <=
        now
        ? {
            count:
              0,
            resetAt:
              now +
              options.windowMs,
          }
        : current;

    bucket.count +=
      1;

    buckets.set(
      key,
      bucket
    );

    const remaining =
      Math.max(
        options.max -
          bucket.count,
        0
      );

    res.setHeader(
      "RateLimit-Limit",
      String(
        options.max
      )
    );

    res.setHeader(
      "RateLimit-Remaining",
      String(
        remaining
      )
    );

    res.setHeader(
      "RateLimit-Reset",
      String(
        Math.ceil(
          bucket.resetAt /
            1000
        )
      )
    );

    if (
      bucket.count >
      options.max
    ) {
      const retryAfterSeconds =
        Math.max(
          Math.ceil(
            (
              bucket.resetAt -
              now
            ) /
              1000
          ),
          1
        );

      res.setHeader(
        "Retry-After",
        String(
          retryAfterSeconds
        )
      );

      res.status(429).json({
        error:
          "RATE_LIMITED",

        message:
          "Too many requests. Please try again later.",
      });

      return;
    }

    next();
  };
}

function normalizedEmail(
  req:
    Request
) {
  const email =
    typeof req.body?.email ===
      "string"
      ? req.body.email
          .trim()
          .toLowerCase()
      : "unknown";

  return `${req.ip ?? "unknown"}:${email}`;
}

export const loginRateLimit =
  createRateLimit({
    windowMs:
      15 * 60 * 1000,
    max:
      10,
    keyPrefix:
      "login",
    getIdentity:
      normalizedEmail,
  });

export const twoFactorRateLimit =
  createRateLimit({
    windowMs:
      15 * 60 * 1000,
    max:
      20,
    keyPrefix:
      "two-factor",
  });

export const passwordResetRateLimit =
  createRateLimit({
    windowMs:
      60 * 60 * 1000,
    max:
      6,
    keyPrefix:
      "password-reset",
    getIdentity:
      normalizedEmail,
  });
