import {
  prisma,
} from "./lib/prisma.js";

import {
  loadSession,
} from "./middleware/session-auth.js";

import {
  requireAuth,
  requireAnyPermission,
  requireOwner,
  requirePermission,
} from "./middleware/access.js";

import {
  auditHttpMiddleware,
} from "./middleware/audit-http.js";

import {
  qaAuditHttpMiddleware,
} from "./middleware/qa-audit-http.js";

import {
  strikeAuditHttpMiddleware,
} from "./middleware/strike-audit-http.js";

import {
  requireQaConfigurationForWrites,
  requireQaView,
} from "./middleware/qa-access.js";

import {
  presentCurrentChatterIdentity,
} from "./middleware/current-chatter-identity.js";

import {
  requestPerformanceMiddleware,
} from "./middleware/request-performance.js";

import {
  loginRateLimit,
  passwordResetRateLimit,
  twoFactorRateLimit,
} from "./middleware/rate-limit.js";

import peopleRoutes from "./routes/people.js";
import peopleQaRoutes from "./routes/people-qa.js";
import teamGroupRoutes from "./routes/team-groups.js";
import modelRoutes from "./routes/models.js";
import roleRoutes from "./routes/roles.js";
import inviteRoutes from "./routes/invites.js";
import authRoutes from "./routes/auth.js";
import accessRoutes from "./routes/access.js";
import auditRoutes from "./routes/audit.js";
import strikeRoutes from "./routes/strikes.js";
import strikeReasonRoutes from "./routes/strike-reasons.js";
import liveRoutes from "./routes/live.js";
import legacyMaintenanceRoutes from "./routes/legacy-maintenance.js";

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
  requestPerformanceMiddleware
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

/*
 * QA mutations have their own focused audit classifier. It records
 * configuration, rules, incident workflow, and legacy chatter writes
 * without duplicating ordinary read traffic.
 */
app.use(
  qaAuditHttpMiddleware
);

app.use(
  strikeAuditHttpMiddleware
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

/*
 * Strike Management is intentionally independent from QA.
 *
 * Only Login Gate authentication and Strike permissions apply.
 * QA view/configuration middleware must never guard this module.
 */
app.use(
  "/api/strikes",
  requireAuth,
  strikeRoutes
);

app.use(
  "/api/strike-reasons",
  requireAuth,
  strikeReasonRoutes
);

app.use(
  "/api/people",
  peopleQaRoutes
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
 * Owner-only maintenance endpoint for safely reconciling legacy QA
 * chatter records that predate the User↔Chatter identity bridge.
 */
app.use(
  "/api/maintenance",
  requireAuth,
  requireOwner,
  legacyMaintenanceRoutes
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
  requireAnyPermission([
    "quality.chatters.view",
    "quality.incidents.view",
  ]),
  presentCurrentChatterIdentity,
  requireQaConfigurationForWrites,
  chatterRoutes
);

app.use(
  "/api/severity-options",
  requireAuth,
  requireQaView,
  requirePermission(
    "quality.rules.view"
  ),
  requireQaConfigurationForWrites,
  severityOptionRoutes
);

app.use(
  "/api/weight-options",
  requireAuth,
  requireQaView,
  requirePermission(
    "quality.rules.view"
  ),
  requireQaConfigurationForWrites,
  weightOptionRoutes
);

app.use(
  "/api/rules",
  requireAuth,
  requireQaView,
  requireAnyPermission([
    "quality.rules.view",
    "quality.incidents.view",
  ]),
  requireQaConfigurationForWrites,
  ruleRoutes
);

app.use(
  "/api/incidents",
  requireAuth,
  requireQaView,
  requirePermission(
    "quality.incidents.view"
  ),
  presentCurrentChatterIdentity,
  incidentRoutes
);

app.use(
  "/api/dashboard",
  requireAuth,
  requireQaView,
  requirePermission(
    "quality.incidents.view"
  ),
  presentCurrentChatterIdentity,
  dashboardRoutes
);

/*
 * Strike Ladder belongs to the independent Strike domain.
 *
 * Reading ladder configuration requires Strike visibility.
 * Mutation-level configuration permission is enforced by
 * the Strike Ladder router itself.
 */
app.use(
  "/api/strike-ladder",
  requireAuth,
  requirePermission(
    "strikes.ladder.view"
  ),
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
  "/health/ready",
  async (
    _req,
    res
  ) => {
    const startedAt =
      Date.now();

    try {
      await prisma.$queryRaw`
        SELECT 1
      `;

      res.status(200).json({
        status:
          "ok",
        message:
          "XYZ Hub API and database are ready",
        databaseLatencyMs:
          Date.now() -
          startedAt,
      });
    } catch (error) {
      console.error(
        "Readiness check failed:",
        error
      );

      res.status(503).json({
        status:
          "error",
        message:
          "XYZ Hub database is not ready",
      });
    }
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
