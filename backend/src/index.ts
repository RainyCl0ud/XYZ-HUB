import {
  prisma,
} from "./lib/prisma.js";

import {
  loadSession,
} from "./middleware/session-auth.js";

import {
  requireAuth,
} from "./middleware/access.js";

import {
  auditHttpMiddleware,
} from "./middleware/audit-http.js";

import {
  requireQaConfigurationForWrites,
  requireQaView,
} from "./middleware/qa-access.js";

import {
  loginRateLimit,
  passwordResetRateLimit,
  twoFactorRateLimit,
} from "./middleware/rate-limit.js";

import peopleRoutes from "./routes/people.js";
import teamGroupRoutes from "./routes/team-groups.js";
import modelRoutes from "./routes/models.js";
import roleRoutes from "./routes/roles.js";
import inviteRoutes from "./routes/invites.js";
import authRoutes from "./routes/auth.js";
import accessRoutes from "./routes/access.js";
import auditRoutes from "./routes/audit.js";
import liveRoutes from "./routes/live.js";

import chatterRoutes from "./routes/qa-chatters.js";
import incidentRoutes from "./routes/qa-incidents.js";
import dashboardRoutes from "./routes/qa-dashboard.js";

import severityOptionRoutes from "./routes/severity-options.js";
import weightOptionRoutes from "./routes/weight-options.js";
import ruleRoutes from "./routes/rules.js";
import strikeLadderRoutes from "./routes/strike-ladder.js";

import cookieParser from "cookie-parser";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app =
  express();

app.set(
  "trust proxy",
  1
);

const PORT =
  process.env.PORT ||
  3000;

const frontendUrl =
  process.env.FRONTEND_URL
    ?.trim()
    .replace(
      /\/+$/,
      ""
    );

const allowedOrigins =
  new Set(
    [
      "http://localhost:5173",
      frontendUrl,
    ].filter(
      (
        origin
      ): origin is string =>
        Boolean(
          origin
        )
    )
  );

app.use(
  cors({
    origin: (
      origin,
      callback
    ) => {
      if (
        !origin
      ) {
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

app.use(
  express.json()
);

app.use(
  cookieParser()
);

app.use(
  loadSession
);

/*
 * Security/audit event capture runs after the
 * session loader so authenticated management
 * actions retain their actor user ID. The audit
 * adapter exposes no update/delete interface.
 */
app.use(
  auditHttpMiddleware
);

app.use(
  "/api/auth/login",
  loginRateLimit
);

app.use(
  "/api/auth/verify-2fa",
  twoFactorRateLimit
);

app.use(
  "/api/auth/password-reset/request",
  passwordResetRateLimit
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
  "/api/access",
  accessRoutes
);

app.use(
  "/api/live",
  liveRoutes
);

app.use(
  "/api/audit",
  auditRoutes
);

app.use(
  "/api/people",
  peopleRoutes
);

app.use(
  "/api/team-groups",
  teamGroupRoutes
);

app.use(
  "/api/models",
  modelRoutes
);

app.use(
  "/api/roles",
  roleRoutes
);

/*
 * Existing QA routes are now protected twice:
 *
 * 1. valid active Login Gate session
 * 2. centralized QA role/model policy
 *
 * Configuration writes are restricted more
 * tightly than normal QA review/incident work.
 */
app.use(
  "/api/chatters",
  requireAuth,
  requireQaView,
  requireQaConfigurationForWrites,
  chatterRoutes
);

app.use(
  "/api/severity-options",
  requireAuth,
  requireQaView,
  requireQaConfigurationForWrites,
  severityOptionRoutes
);

app.use(
  "/api/weight-options",
  requireAuth,
  requireQaView,
  requireQaConfigurationForWrites,
  weightOptionRoutes
);

app.use(
  "/api/rules",
  requireAuth,
  requireQaView,
  requireQaConfigurationForWrites,
  ruleRoutes
);

app.use(
  "/api/incidents",
  requireAuth,
  requireQaView,
  incidentRoutes
);

app.use(
  "/api/dashboard",
  requireAuth,
  requireQaView,
  dashboardRoutes
);

app.use(
  "/api/strike-ladder",
  requireAuth,
  requireQaView,
  requireQaConfigurationForWrites,
  strikeLadderRoutes
);

app.get(
  "/health",
  (_req, res) => {
    res.status(200).json({
      status:
        "ok",

      message:
        "XYZ Hub API is running",
    });
  }
);

app.get(
  "/health/db",
  requireAuth,
  async (
    _req,
    res
  ) => {
    try {
      const chatterCount =
        await prisma.chatter.count();

      res.status(200).json({
        status:
          "ok",

        message:
          "Database connection is working",

        chatterCount,
      });
    } catch (
      error
    ) {
      console.error(
        "Database health check failed:",
        error
      );

      res.status(500).json({
        status:
          "error",

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
