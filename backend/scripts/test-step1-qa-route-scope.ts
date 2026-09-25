/// <reference types="node" />

import "dotenv/config";

import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { RoleDataScope } from "@prisma/client";

import { prisma } from "../src/lib/prisma.js";
import type { AuthenticatedRequest } from "../src/middleware/access.js";
import {
  requireQaConfigurationForWrites,
  requireQaView,
} from "../src/middleware/qa-access.js";
import type { AccessContext } from "../src/services/access-control.js";
import chatterRoutes from "../src/routes/qa-chatters.js";
import dashboardRoutes from "../src/routes/qa-dashboard.js";

async function main() {
  // These integration fixtures must never reach a remote environment.
  const database = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(database.hostname),
    "QA route regression tests require a local database."
  );

  const suffix = `${Date.now()}-${process.pid}`;
  const modelIds: string[] = [];
  const userIds: string[] = [];
  const chatterIds: string[] = [];
  const app = express();
  const server = app.listen(0, "127.0.0.1");

  try {
    await once(server, "listening");

    for (const label of ["A", "B"]) {
      const model = await prisma.agencyModel.create({
        data: { name: `QA route ${label} ${suffix}` },
      });
      modelIds.push(model.id);

      const user = await prisma.user.create({
        data: {
          name: `QA route chatter ${label}`,
          email: `qa-route-${label.toLowerCase()}-${suffix}@example.test`,
          modelAssignments: {
            create: { modelId: model.id },
          },
        },
      });
      userIds.push(user.id);

      const chatter = await prisma.chatter.create({
        data: {
          name: `QA route chatter ${label} ${suffix}`,
          userId: user.id,
        },
      });
      chatterIds.push(chatter.id);
    }

    const [modelA, modelB] = modelIds;
    const [chatterA, chatterB] = chatterIds;

    function accessFor(systemKey: string): AccessContext {
      const allModels = systemKey === "OWNER";
      const dataScope = allModels
        ? RoleDataScope.ALL
        : RoleDataScope.SELF_AND_TEAM;

      return {
        userId: "route-test-actor",
        roles: [{
          id: `route-test-${systemKey}`,
          systemKey,
          name: systemKey,
          rank: allModels ? 1 : systemKey === "MANAGER" ? 3 : 4,
          dataScope,
        }],
        highestRank: allModels ? 1 : 3,
        effectiveDataScope: dataScope,
        permissions: new Set(),
        assignedModelIds: allModels ? [] : [modelA],
        canSeeAllModels: allModels,
      };
    }

    app.use(express.json());
    // Authentication itself has separate coverage. Inject an access context
    // only in this local harness to exercise the real mounted QA routers.
    app.use((req: AuthenticatedRequest, _res, next) => {
      req.access = accessFor(req.header("x-test-role") ?? "MANAGER");
      next();
    });
    app.use(
      "/api/chatters",
      requireQaView,
      requireQaConfigurationForWrites,
      chatterRoutes
    );
    app.use("/api/dashboard", requireQaView, dashboardRoutes);

    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    async function request(
      path: string,
      options: {
        method?: string;
        role?: string;
        modelId?: string;
        body?: unknown;
      } = {}
    ) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: options.method ?? "GET",
        headers: {
          "content-type": "application/json",
          "x-test-role": options.role ?? "MANAGER",
          ...(options.modelId ? { "x-xyz-model-id": options.modelId } : {}),
        },
        ...(options.body === undefined
          ? {}
          : { body: JSON.stringify(options.body) }),
      });

      return {
        status: response.status,
        body: await response.json() as Record<string, any>,
      };
    }

    for (const role of ["MANAGER", "QC"]) {
      for (const path of [
        "/api/chatters",
        `/api/chatters/${chatterA}`,
        "/api/dashboard/summary",
      ]) {
        const denied = await request(path, { role, modelId: modelB });
        assert.equal(denied.status, 403, `${role} forbidden model on ${path}`);
        assert.equal(denied.body.error, "MODEL_NOT_ACCESSIBLE");
      }

      const allowed = await request("/api/chatters", { role, modelId: modelA });
      assert.equal(allowed.status, 200);
      assert.ok(allowed.body.data.some((chatter: { id: string }) => chatter.id === chatterA));
      assert.ok(!allowed.body.data.some((chatter: { id: string }) => chatter.id === chatterB));
    }
    console.log("✓ Manager/QC forbidden model headers return 403; allowed reads stay scoped");

    const hiddenChatter = await request(`/api/chatters/${chatterB}`);
    assert.equal(hiddenChatter.status, 404);

    const mutations = [
      { route: "", body: { name: `Unexpected rename ${suffix}` }, initialStatus: "ACTIVE" as const },
      { route: "/deactivate", body: {}, initialStatus: "ACTIVE" as const },
      { route: "/reactivate", body: {}, initialStatus: "INACTIVE" as const },
    ];

    for (const mutation of mutations) {
      await prisma.chatter.update({
        where: { id: chatterB },
        data: { status: mutation.initialStatus },
      });
      const before = await prisma.chatter.findUniqueOrThrow({ where: { id: chatterB } });

      // Omitting model context must not bypass assignment-based authorization.
      for (const modelId of [undefined, modelA]) {
        const denied = await request(`/api/chatters/${chatterB}${mutation.route}`, {
          method: "PATCH",
          modelId,
          body: mutation.body,
        });
        assert.equal(denied.status, 404, `out-of-scope mutation ${mutation.route}`);
      }

      const forbiddenContext = await request(`/api/chatters/${chatterB}${mutation.route}`, {
        method: "PATCH",
        modelId: modelB,
        body: mutation.body,
      });
      assert.equal(forbiddenContext.status, 403);
      assert.equal(forbiddenContext.body.error, "MODEL_NOT_ACCESSIBLE");

      const after = await prisma.chatter.findUniqueOrThrow({ where: { id: chatterB } });
      assert.equal(after.name, before.name);
      assert.equal(after.status, before.status);
      assert.equal(after.updatedAt.getTime(), before.updatedAt.getTime());
    }
    console.log("✓ direct chatter edit/deactivate/reactivate cannot mutate another model's profile");

    const renamed = await request(`/api/chatters/${chatterA}`, {
      method: "PATCH",
      modelId: modelA,
      body: { name: `QA route renamed ${suffix}` },
    });
    assert.equal(renamed.status, 200);
    assert.equal(renamed.body.data.name, `QA route renamed ${suffix}`);

    for (const route of ["deactivate", "reactivate"]) {
      const allowed = await request(`/api/chatters/${chatterA}/${route}`, {
        method: "PATCH",
        modelId: modelA,
        body: {},
      });
      assert.equal(allowed.status, 200);
      assert.equal(allowed.body.data.status, route === "deactivate" ? "INACTIVE" : "ACTIVE");
    }

    const ownerAllowed = await request(`/api/chatters/${chatterB}/reactivate`, {
      method: "PATCH",
      role: "OWNER",
      body: {},
    });
    assert.equal(ownerAllowed.status, 200);
    assert.equal(ownerAllowed.body.data.status, "ACTIVE");
    console.log("✓ Manager in-scope writes and Owner global writes still succeed");
    console.log("All Step 1 QA route-scope regression tests passed.");
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await prisma.chatter.deleteMany({ where: { id: { in: chatterIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.agencyModel.deleteMany({ where: { id: { in: modelIds } } });
  }
}

main()
  .catch((error) => {
    console.error("Step 1 QA route-scope regression failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
