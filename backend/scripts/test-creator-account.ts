/// <reference types="node" />
import "dotenv/config";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import cookieParser from "cookie-parser";
import { prisma } from "../src/lib/prisma.js";
import { getAccessContext } from "../src/services/access-control.js";
import { invitePerson } from "../src/services/people-invite.js";
import { updatePersonAccess } from "../src/services/people-access-update.js";
import { deletePerson } from "../src/services/people-delete.js";
import { CreatorAccountError, ensureCreatorAccount } from "../src/services/creator-account.js";
import { getPeopleManagementOptions } from "../src/services/people-options.js";
import { listManagedModels } from "../src/services/model-management.js";
import { ROOT_TEAM_GROUP_ID } from "../src/services/team-hierarchy.js";
import { createSession } from "../src/services/session.js";
import { loadSession } from "../src/middleware/session-auth.js";
import { auditHttpMiddleware } from "../src/middleware/audit-http.js";
import { presentAuditEvents } from "../src/services/audit-presentation.js";
import peopleRoutes from "../src/routes/people.js";

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(database.hostname),
    "Creator-account integration tests require an isolated local database.");
  process.env.AUDIT_STORE_MODE = "database";
  process.env.EMAIL_DELIVERY_MODE = "console";
  process.env.INVITE_DELIVERY_MODE = "console";
  const prefix = `creator-link-${Date.now()}-${process.pid}`;
  const users: string[] = [];
  const models: string[] = [];
  const [ownerRole, creatorRole, chatterRole, managerRole, staffRole] = await Promise.all(
    ["OWNER", "MODEL", "CHATTER", "MANAGER", "GENERAL_STAFF"].map((systemKey) =>
      prisma.role.findUniqueOrThrow({ where: { systemKey } })),
  );
  const makeUser = async (label: string, roleId = staffRole.id) => {
    const user = await prisma.user.create({ data: {
      name: `${prefix} ${label}`, email: `${prefix}-${label}@example.test`, status: "ACTIVE",
      teamGroupId: ROOT_TEAM_GROUP_ID, roleMemberships: { create: { roleId } },
    } });
    users.push(user.id);
    return user;
  };
  const makeModel = async (label: string, isActive = true) => {
    const model = await prisma.agencyModel.create({ data: { name: `${prefix} ${label}`, isActive } });
    models.push(model.id);
    return model;
  };
  const app = express();
  app.use(express.json(), cookieParser(), loadSession, auditHttpMiddleware);
  app.use("/api/people", peopleRoutes);
  const server = app.listen(0, "127.0.0.1");
  let passed = 0;
  const check = (message: string) => { passed++; console.log(`✓ ${message}`); };
  try {
    await once(server, "listening");
    const owner = await makeUser("owner", ownerRole.id);
    const manager = await makeUser("manager", managerRole.id);
    const access = await getAccessContext(owner.id);
    const managerAccess = await getAccessContext(manager.id);
    const invite = async (label: string, creatorModelId?: string, roleIds = [creatorRole.id]) => {
      const result = await invitePerson({ name: `${prefix} ${label}`, email: `${prefix}-${label}@example.test`,
        roleIds, modelIds: [], creatorModelId }, access);
      users.push(result.user.id);
      const profile = await prisma.agencyModel.findUnique({ where: { creatorUserId: result.user.id } });
      if (profile && !models.includes(profile.id)) models.push(profile.id);
      return result.user;
    };
    const update = (userId: string, creatorModelId?: string, roleIds = [creatorRole.id], modelIds: string[] = []) =>
      updatePersonAccess({ userId, creatorModelId, roleIds, modelIds }, access);
    const expectError = async (action: () => Promise<unknown>, code: string) => {
      await assert.rejects(action, (error: unknown) => error instanceof Error && "code" in error && error.code === code);
    };

    const invited = await invite("invited");
    const automatic = await prisma.agencyModel.findUniqueOrThrow({ where: { creatorUserId: invited.id } });
    assert.equal(automatic.name, invited.name);
    assert.equal(invited.status, "PENDING_SETUP");
    assert.equal(await prisma.userModelAssignment.count({ where: { userId: invited.id } }), 0);
    check("Creator invitation automatically creates its profile without treating ownership as a staff assignment");

    const staff = await makeUser("chatter", chatterRole.id);
    await updatePersonAccess({ userId: staff.id, roleIds: [chatterRole.id], modelIds: [automatic.id] }, access);
    assert.equal(await prisma.userModelAssignment.count({ where: { userId: staff.id, modelId: automatic.id } }), 1);
    assert.ok((await getPeopleManagementOptions(access)).models.some((model) => model.id === automatic.id));
    check("Other staff can be assigned to the automatically created creator using the existing workflow");

    const existing = await makeUser("existing");
    await update(existing.id);
    const existingProfile = await prisma.agencyModel.findUniqueOrThrow({ where: { creatorUserId: existing.id } });
    models.push(existingProfile.id);
    await update(existing.id);
    assert.equal(await prisma.agencyModel.count({ where: { creatorUserId: existing.id } }), 1);
    check("Adding the Creator role to an existing account creates one profile; repeated saves do not duplicate it");

    const ordinary = await invite("ordinary", undefined, [chatterRole.id]);
    assert.equal(await prisma.agencyModel.count({ where: { creatorUserId: ordinary.id } }), 0);
    check("Inviting ordinary staff does not create a creator profile");

    const legacy = await makeModel("legacy", false);
    const assignment = await prisma.userModelAssignment.create({ data: { userId: staff.id, modelId: legacy.id } });
    const legacyAccount = await invite("legacy-login", legacy.id);
    const preserved = await prisma.agencyModel.findUniqueOrThrow({ where: { id: legacy.id } });
    assert.equal(preserved.creatorUserId, legacyAccount.id);
    assert.equal(preserved.name, legacy.name);
    assert.equal(preserved.isActive, false);
    assert.ok(await prisma.userModelAssignment.findUnique({ where: { id: assignment.id } }));
    check("Explicit linking keeps a legacy creator's ID, name, inactive state and existing staff assignments");

    const countBefore = await prisma.user.count();
    await expectError(() => invite("legacy"), "CREATOR_NAME_NEEDS_LINK");
    assert.equal(await prisma.user.count(), countBefore);
    assert.equal(await prisma.user.count({ where: { email: `${prefix}-legacy@example.test` } }), 0);
    check("Matching names never claim an existing profile; a failed invitation leaves no partial account");

    const target = await makeUser("rollback");
    const targetBefore = await prisma.userRole.findMany({ where: { userId: target.id } });
    await expectError(() => update(target.id, legacy.id, [creatorRole.id], [automatic.id]), "CREATOR_PROFILE_ALREADY_LINKED");
    assert.deepEqual(await prisma.userRole.findMany({ where: { userId: target.id } }), targetBefore);
    assert.equal(await prisma.userModelAssignment.count({ where: { userId: target.id } }), 0);
    await expectError(() => update(existing.id, legacy.id), "CREATOR_PROFILE_ALREADY_LINKED");
    assert.equal((await prisma.agencyModel.findUniqueOrThrow({ where: { id: existingProfile.id } })).creatorUserId, existing.id);
    check("A conflicting link cannot steal a profile, switch an existing link, or partially change roles and assignments");

    await expectError(() => update(target.id, "missing-creator"), "CREATOR_PROFILE_NOT_FOUND");
    await expectError(() => update(target.id, automatic.id, [staffRole.id]), "CREATOR_ROLE_REQUIRED");
    const nonOwnerTarget = await makeUser("nonowner-target", chatterRole.id);
    await expectError(() => updatePersonAccess({ userId: nonOwnerTarget.id, roleIds: [creatorRole.id], modelIds: [] }, managerAccess), "ROLE_NOT_ASSIGNABLE");
    await expectError(() => invitePerson({ name: `${prefix} forbidden`, email: `${prefix}-forbidden@example.test`,
      roleIds: [creatorRole.id], modelIds: [] }, managerAccess), "ROLE_NOT_ASSIGNABLE");
    await expectError(() => prisma.$transaction((tx) => ensureCreatorAccount(tx, target, [creatorRole], null, managerAccess)), "CREATOR_ACCOUNT_OWNER_REQUIRED");
    check("Missing profiles, linking without the Creator role, and non-Owner attempts are rejected");

    const limited = { ...access, permissions: new Set(access.permissions) };
    limited.permissions.delete("models.create");
    await expectError(() => updatePersonAccess({ userId: target.id, roleIds: [creatorRole.id], modelIds: [] }, limited), "CREATOR_ACCOUNT_PERMISSION_REQUIRED");
    const unlinked = await makeModel("permission-test");
    limited.permissions.delete("models.edit");
    await expectError(() => updatePersonAccess({ userId: target.id, roleIds: [creatorRole.id], modelIds: [], creatorModelId: unlinked.id }, limited), "CREATOR_ACCOUNT_PERMISSION_REQUIRED");
    assert.deepEqual(await prisma.userRole.findMany({ where: { userId: target.id } }), targetBefore);
    check("Configured Create/Edit Creators permissions are respected, with no partial role update");

    const raceModel = await makeModel("race");
    const racerA = await makeUser("racer-a");
    const racerB = await makeUser("racer-b");
    const results = await Promise.allSettled([update(racerA.id, raceModel.id), update(racerB.id, raceModel.id)]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const loser = results.findIndex((result) => result.status === "rejected") === 0 ? racerA : racerB;
    assert.equal(await prisma.userRole.count({ where: { userId: loser.id, roleId: creatorRole.id } }), 0);
    check("Concurrent attempts to link the same creator allow one winner and roll back the other account's role change");

    await update(existing.id, undefined, [staffRole.id]);
    assert.equal((await prisma.agencyModel.findUniqueOrThrow({ where: { id: existingProfile.id } })).creatorUserId, existing.id);
    assert.equal((await listManagedModels(access)).find((model) => model.id === existingProfile.id)?.creatorAccount?.hasCreatorRole, false);
    await update(existing.id);
    assert.equal(await prisma.agencyModel.count({ where: { creatorUserId: existing.id } }), 1);
    check("Removing and restoring the Creator role preserves the creator profile and reports its actual role status");

    const ownerView = (await listManagedModels(access)).find((model) => model.id === automatic.id);
    assert.equal(ownerView?.creatorAccount?.id, invited.id);
    assert.ok(!JSON.stringify(ownerView).includes(invited.email));
    const nonOwnerView = await listManagedModels({ ...managerAccess, permissions: new Set([...managerAccess.permissions, "models.access"]) });
    assert.equal(nonOwnerView.find((model) => model.id === automatic.id)?.creatorAccount, null);
    assert.deepEqual((await getPeopleManagementOptions(managerAccess)).creatorModels, []);
    assert.ok(!(await getPeopleManagementOptions(access)).models.some((model) => "creatorUserId" in model));
    check("Linked account details are Owner-only, without exposing account emails through Creator Management or staff options");

    const session = await createSession({ userId: owner.id, expiresAt: new Date(Date.now() + 60000) });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const request = (path: string, body: object) => fetch(base + path, { method: "PUT",
      headers: { "content-type": "application/json", cookie: `xyz_session=${session.token}` }, body: JSON.stringify(body) });
    const httpTarget = await makeUser("http");
    const response = await request(`/api/people/${httpTarget.id}/access`, { roleIds: [creatorRole.id], modelIds: [], creatorModelId: unlinked.id });
    assert.equal(response.status, 200, await response.text());
    assert.equal((await prisma.agencyModel.findUniqueOrThrow({ where: { id: unlinked.id } })).creatorUserId, httpTarget.id);
    const denied = await request(`/api/people/${target.id}/access`, { roleIds: [creatorRole.id], modelIds: [], creatorModelId: unlinked.id });
    assert.equal(denied.status, 409);
    assert.equal((await denied.json()).error, "CREATOR_PROFILE_ALREADY_LINKED");
    check("The authenticated HTTP endpoint accepts the profile selection and returns actionable conflict responses");

    let audited = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      const event = await prisma.auditEvent.findFirst({ where: { action: "people.access_changed", targetId: httpTarget.id, success: true } });
      if (event) {
        const metadata = event.metadata as { before: { creatorProfile: unknown }; after: { creatorProfile: { id: string } }; requested: { creatorModelId: string } };
        assert.equal(metadata.before.creatorProfile, null);
        assert.equal(metadata.after.creatorProfile.id, unlinked.id);
        assert.equal(metadata.requested.creatorModelId, unlinked.id);
        const [display] = await presentAuditEvents([{ ...event, occurredAt: event.occurredAt.toISOString(),
          metadata: metadata as unknown as Record<string, unknown> }]);
        assert.ok(display?.changes.some((change) => change.label === "Creator profile" && change.after === unlinked.name));
        audited = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(audited, true, "The creator connection must be present in the database audit record");
    check("The audit captures the selected creator and the actual before/after account connection");

    await deletePerson({ userId: legacyAccount.id, confirmEmail: legacyAccount.email }, access);
    assert.equal((await prisma.agencyModel.findUniqueOrThrow({ where: { id: legacy.id } })).creatorUserId, null);
    assert.ok(await prisma.userModelAssignment.findUnique({ where: { id: assignment.id } }));
    check("Deleting a login account leaves the creator profile and its staff assignments intact");

    // Optional fixture created before applying the migration, for the upgrade rehearsal.
    const migrationCreator = await prisma.agencyModel.findUnique({ where: { id: "migration-legacy-creator" } });
    if (migrationCreator) {
      assert.equal(migrationCreator.creatorUserId, null);
      assert.equal(migrationCreator.isActive, false);
      assert.ok(await prisma.userModelAssignment.findUnique({ where: { id: "migration-assignment" } }));
      assert.equal((await prisma.incident.findUniqueOrThrow({ where: { id: "migration-incident" } })).details, "Preserve this history");
      check("The migration preserves pre-existing creator records, staff assignments and QA history");
    }
    console.log(`All ${passed} creator-account integration checks passed.`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.agencyModel.deleteMany({ where: { id: { in: models } } });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
