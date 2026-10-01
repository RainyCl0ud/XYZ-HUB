/// <reference types="node" />

import "dotenv/config";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import { RoleDataScope, UserStatus } from "@prisma/client";

import { prisma } from "../src/lib/prisma.js";
import type { AuthenticatedRequest } from "../src/middleware/access.js";
import { requireQaView } from "../src/middleware/qa-access.js";
import incidentRoutes from "../src/routes/qa-incidents.js";
import type { AccessContext } from "../src/services/access-control.js";

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(
    ["localhost", "127.0.0.1", "[::1]"].includes(database.hostname),
    "Incident write regression tests may only run against a local database."
  );

  const suffix = `${Date.now()}-${process.pid}`;
  const modelIds: string[] = [];
  let chatterId: string | undefined;
  let userId: string | undefined;
  let ruleId: string | undefined;
  let access: AccessContext | undefined;

  const app = express();
  app.use(express.json());
  app.use((req: AuthenticatedRequest, _res, next) => {
    req.access = access;
    next();
  });
  app.use("/api/incidents", requireQaView, incidentRoutes);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}/api/incidents`;

  async function request(
    method: string,
    path = "",
    body?: object,
    modelId = modelIds[0]
  ) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-xyz-model-id": modelId,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json() };
  }

  function asRoles(...systemKeys: string[]): AccessContext {
    return {
      userId: "incident-route-test-actor",
      roles: systemKeys.map((systemKey) => ({
        id: systemKey,
        name: systemKey,
        systemKey,
        rank: null,
        dataScope: RoleDataScope.SELF_AND_TEAM,
      })),
      highestRank: null,
      effectiveDataScope: RoleDataScope.SELF_AND_TEAM,
      permissions: new Set(),
      assignedModelIds: [modelIds[0]!],
      canSeeAllModels: systemKeys.some((key) =>
        ["OWNER", "OPS_MANAGER", "DEV"].includes(key)
      ),
    };
  }

  try {
    for (const label of ["Assigned", "Unassigned"]) {
      const model = await prisma.agencyModel.create({
        data: { name: `Incident write ${label} ${suffix}` },
      });
      modelIds.push(model.id);
    }
    const user = await prisma.user.create({
      data: {
        name: "Incident write fixture",
        email: `incident-write-${suffix}@example.test`,
        status: UserStatus.ACTIVE,
        modelAssignments: { create: { modelId: modelIds[0]! } },
      },
    });
    userId = user.id;
    const chatter = await prisma.chatter.create({
      data: { name: `Incident write chatter ${suffix}`, userId },
    });
    chatterId = chatter.id;
    const rule = await prisma.rule.create({
      data: {
        versions: {
          create: {
            versionNumber: 1,
            title: `Incident write rule ${suffix}`,
            definition: "Temporary local authorization regression fixture.",
          },
        },
      },
      include: { versions: true },
    });
    ruleId = rule.id;
    const protectedIncident = await prisma.incident.create({
      data: {
        chatterId,
        ruleVersionId: rule.versions[0]!.id,
        modelId: modelIds[0]!,
        ruleTitleSnapshot: rule.versions[0]!.title,
        ruleDefinitionSnapshot: rule.versions[0]!.definition,
        expiresAt: new Date(Date.now() + 86_400_000),
        details: "QC must not alter this fixture.",
      },
    });
    const createBody = { chatterId, ruleId, details: "Allowed incident write test." };
    const mutations = [
      { method: "POST", path: "", body: createBody },
      { method: "PATCH", path: `/${protectedIncident.id}/resolve`, body: { resolutionNotes: "Attempted resolution" } },
      { method: "PATCH", path: `/${protectedIncident.id}/void`, body: { reason: "Attempted void" } },
    ];

    for (const mutation of mutations) {
      const result = await request(mutation.method, mutation.path, mutation.body);
      assert.equal(result.status, 401, "Anonymous mutation must be rejected.");
    }

    for (const roles of [["QC"], ["QC", "CHATTER"]]) {
      access = asRoles(...roles);
      const read = await request("GET", `/${protectedIncident.id}`);
      assert.equal(read.status, 200, `${roles.join("+")} retains scoped read access.`);
      for (const mutation of mutations) {
        const result = await request(mutation.method, mutation.path, mutation.body);
        assert.equal(result.status, 403, `${roles.join("+")} cannot ${mutation.method} ${mutation.path}.`);
        assert.equal(result.body.error, "QA_INCIDENT_WRITE_REQUIRED");
      }
    }
    const unchanged = await prisma.incident.findUniqueOrThrow({
      where: { id: protectedIncident.id },
    });
    assert.equal(unchanged.status, "OPEN");
    assert.equal(unchanged.resolutionNotes, null);
    assert.equal(unchanged.voidReason, null);
    assert.equal(await prisma.incident.count({ where: { chatterId } }), 1);
    console.log("✓ QC and QC+Chatter can read but cannot create, resolve, or void incidents");

    for (const role of ["OWNER", "OPS_MANAGER", "MANAGER", "DEV"]) {
      for (const roles of [[role], ["QC", role]]) {
        access = asRoles(...roles);
        const createdForResolve = await request("POST", "", createBody);
        assert.equal(createdForResolve.status, 201, `${roles.join("+")} can create for resolve: ${JSON.stringify(createdForResolve.body)}`);
        const resolvedIncidentId = createdForResolve.body.data.id as string;
        const resolved = await request("PATCH", `/${resolvedIncidentId}/resolve`, { resolutionNotes: "Allowed resolution." });
        assert.equal(resolved.status, 200, `${roles.join("+")} can resolve.`);
        assert.equal(resolved.body.data.status, "RESOLVED");

        const rejectedVoid = await request("PATCH", `/${resolvedIncidentId}/void`, { reason: "Resolved incidents must not be voided." });
        assert.equal(rejectedVoid.status, 409, `${roles.join("+")} cannot void a resolved incident.`);
        const savedResolved = await prisma.incident.findUniqueOrThrow({ where: { id: resolvedIncidentId } });
        assert.equal(savedResolved.status, "RESOLVED");
        assert.equal(savedResolved.voidReason, null);

        const createdForVoid = await request("POST", "", createBody);
        assert.equal(createdForVoid.status, 201, `${roles.join("+")} can create for void: ${JSON.stringify(createdForVoid.body)}`);
        const openIncidentId = createdForVoid.body.data.id as string;
        const voided = await request("PATCH", `/${openIncidentId}/void`, { reason: "Allowed void." });
        assert.equal(voided.status, 200, `${roles.join("+")} can void an open incident.`);
        assert.equal(voided.body.data.status, "VOIDED");
        const savedVoided = await prisma.incident.findUniqueOrThrow({ where: { id: openIncidentId } });
        assert.equal(savedVoided.status, "VOIDED");
        assert.equal(savedVoided.voidReason, "Allowed void.");
      }
    }
    console.log("✓ Owner, Ops Manager, Manager, Dev and each stacked with QC retain all incident writes");

    access = asRoles("QC", "MANAGER");
    for (const mutation of mutations) {
      const result = await request(mutation.method, mutation.path, mutation.body, modelIds[1]);
      assert.equal(result.status, 403, "A write-capable stacked role still cannot access an unassigned model.");
      assert.equal(result.body.error, "MODEL_NOT_ACCESSIBLE");
    }
    console.log("✓ stacked-role write permission preserves model isolation");
    console.log("All Step 1 incident-write authorization tests passed.");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (chatterId) {
      await prisma.incident.deleteMany({ where: { chatterId } });
      await prisma.chatter.delete({ where: { id: chatterId } });
    }
    if (ruleId) {
      await prisma.ruleVersion.deleteMany({ where: { ruleId } });
      await prisma.rule.delete({ where: { id: ruleId } });
    }
    if (userId) await prisma.user.delete({ where: { id: userId } });
    if (modelIds.length) await prisma.agencyModel.deleteMany({ where: { id: { in: modelIds } } });
  }
}

main().catch((error) => {
  console.error("Step 1 incident-write authorization test failed:", error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
