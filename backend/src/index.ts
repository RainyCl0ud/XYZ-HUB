import {
  prisma,
} from "./lib/prisma.js";

import {
  loadSession,
} from "./middleware/session-auth.js";

import {
  requireAuth,
} from "./middleware/access.js";

import peopleRoutes from "./routes/people.js";

import modelRoutes from "./routes/models.js";

import inviteRoutes from "./routes/invites.js";

import authRoutes from "./routes/auth.js";

import cookieParser from "cookie-parser";

import chatterRoutes from "./routes/chatters.js";

import severityOptionRoutes from "./routes/severity-options.js";

import weightOptionRoutes from "./routes/weight-options.js";

import ruleRoutes from "./routes/rules.js";

import incidentRoutes from "./routes/incidents.js";

import dashboardRoutes from "./routes/dashboard.js";

import strikeLadderRoutes from "./routes/strike-ladder.js";

import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

const PORT =
  process.env.PORT || 3000;

const frontendUrl =
  process.env.FRONTEND_URL
    ?.trim()
    .replace(/\/+$/, "");

const allowedOrigins =
  new Set(
    [
      "http://localhost:5173",

      frontendUrl,
    ].filter(
      (
        origin
      ): origin is string =>
        Boolean(origin)
    )
  );

app.use(
  cors({
    origin: (
      origin,
      callback
    ) => {
      /*
       * Requests without an Origin header
       * include tools such as PowerShell,
       * curl, health checks, and server-side
       * requests.
       */
      if (!origin) {
        callback(
          null,
          true
        );

        return;
      }

      if (
        allowedOrigins.has(
          origin
        )
      ) {
        callback(
          null,
          true
        );

        return;
      }

      callback(
        new Error(
          `Origin ${origin} is not allowed by CORS.`
        )
      );
    },

    credentials:
      true,
  })
);

app.use(express.json());

app.use(
  cookieParser()
);

app.use(
  loadSession
);

app.use(
  "/api/auth",
  authRoutes
);

app.use(
  "/api/invites",
  inviteRoutes
);

app.use(
  "/api/people",
  peopleRoutes
);

app.use(
  "/api/models",
  modelRoutes
);

/*
 * The QA/operations API predates Login Gate.
 *
 * Frontend route protection is not a security
 * boundary, so every internal API below also
 * requires a valid active XYZ Hub session.
 *
 * Fine-grained role/model authorization can be
 * layered on top of this baseline as each
 * workflow's permission rules are finalized.
 */
app.use(
  "/api/chatters",
  requireAuth,
  chatterRoutes
);

app.use(
  "/api/severity-options",
  requireAuth,
  severityOptionRoutes
);

app.use(
  "/api/weight-options",
  requireAuth,
  weightOptionRoutes
);

app.use(
  "/api/rules",
  requireAuth,
  ruleRoutes
);

app.use(
  "/api/incidents",
  requireAuth,
  incidentRoutes
);

app.use(
  "/api/dashboard",
  requireAuth,
  dashboardRoutes
);

app.use(
  "/api/strike-ladder",
  requireAuth,
  strikeLadderRoutes
);

app.get(
  "/health",
  (_req, res) => {
    res.status(200).json({
      status: "ok",

      message:
        "XYZ Hub API is running",
    });
  }
);

app.get(
  "/health/db",
  requireAuth,
  async (_req, res) => {
    try {
      const chatterCount =
        await prisma.chatter.count();

      res.status(200).json({
        status: "ok",

        message:
          "Database connection is working",

        chatterCount,
      });
    } catch (error) {
      console.error(
        "Database health check failed:",
        error
      );

      res.status(500).json({
        status: "error",

        message:
          "Database connection failed",
      });
    }
  }
);

app.listen(
  PORT,
  () => {
    console.log(
      `API running on http://localhost:${PORT}`
    );
  }
);
