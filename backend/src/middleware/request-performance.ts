import type {
  NextFunction,
  Request,
  Response,
} from "express";

const DEFAULT_SLOW_REQUEST_MS =
  500;

function readSlowRequestThreshold() {
  const parsed =
    Number(
      process.env.SLOW_REQUEST_MS
    );

  if (
    Number.isFinite(parsed) &&
    parsed >= 100
  ) {
    return parsed;
  }

  return DEFAULT_SLOW_REQUEST_MS;
}

function shouldIgnorePath(
  path: string
) {
  return (
    path === "/api/live" ||
    path.startsWith("/api/live?")
  );
}

export function requestPerformanceMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const startedAt =
    process.hrtime.bigint();
  const path =
    req.originalUrl ||
    req.url;
  const thresholdMs =
    readSlowRequestThreshold();

  let completed =
    false;

  function elapsedMs() {
    return Number(
      process.hrtime.bigint() -
        startedAt
    ) / 1_000_000;
  }

  function finish() {
    if (completed) {
      return;
    }

    completed = true;

    if (
      shouldIgnorePath(path)
    ) {
      return;
    }

    const durationMs =
      elapsedMs();

    if (
      durationMs >=
      thresholdMs
    ) {
      console.warn(
        `[slow-request] ${req.method} ${path} ${res.statusCode} ${durationMs.toFixed(0)}ms`
      );
    }
  }

  function close() {
    if (completed) {
      return;
    }

    completed = true;

    if (
      shouldIgnorePath(path) ||
      res.writableEnded
    ) {
      return;
    }

    console.warn(
      `[client-disconnect] ${req.method} ${path} ${elapsedMs().toFixed(0)}ms`
    );
  }

  res.once(
    "finish",
    finish
  );

  res.once(
    "close",
    close
  );

  next();
}
