import {
  Router,
} from "express";

import {
  type AuthenticatedRequest,
  requireAuth,
} from "../middleware/access.js";

import {
  subscribeLiveUpdates,
} from "../services/live-updates.js";

const router =
  Router();

router.get(
  "/",

  requireAuth,

  (
    req:
      AuthenticatedRequest,
    res
  ) => {
    res.status(
      200
    );

    res.set({
      "Content-Type":
        "text/event-stream",
      "Cache-Control":
        "no-cache, no-transform",
      Connection:
        "keep-alive",
      "X-Accel-Buffering":
        "no",
    });

    res.flushHeaders();

    res.write(
      "event: ready\n"
    );

    res.write(
      "data: {}\n\n"
    );

    const unsubscribe =
      subscribeLiveUpdates(
        (
          update
        ) => {
          if (
            update.type ===
              "access.changed" &&
            update.userId &&
            update.userId !==
              req.userId
          ) {
            return;
          }

          res.write(
            `event: ${update.type}\n`
          );

          res.write(
            `data: ${JSON.stringify(
              update
            )}\n\n`
          );
        }
      );

    const heartbeat =
      setInterval(
        () => {
          res.write(
            ": keepalive\n\n"
          );
        },
        20_000
      );

    let closed =
      false;

    function cleanup() {
      if (
        closed
      ) {
        return;
      }

      closed =
        true;

      clearInterval(
        heartbeat
      );

      unsubscribe();
    }

    req.on(
      "close",
      cleanup
    );

    res.on(
      "close",
      cleanup
    );
  }
);

export default router;
