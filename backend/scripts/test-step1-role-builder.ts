/// <reference types="node" />

import "dotenv/config";

import assert from "node:assert/strict";

import {
  RoleDataScope,
  UserStatus,
} from "@prisma/client";

import {
  prisma,
} from "../src/lib/prisma.js";

import {
  getAccessContext,
} from "../src/services/access-control.js";

import {
  archiveRole,
  createRole,
  getRoleBuilderData,
  reactivateRole,
  RoleManagementError,
  updateRole,
} from "../src/services/role-management.js";

async function expectRoleError(
  action:
    () => Promise<unknown>,
  expectedCode:
    RoleManagementError["code"]
) {
  try {
    await action();

    assert.fail(
      `Expected ${expectedCode}`
    );
  } catch (
    error
  ) {
    assert.ok(
      error instanceof
        RoleManagementError
    );

    assert.equal(
      error.code,
      expectedCode
    );
  }
}

async function main() {
  console.log(
    "Starting Step 1 Role Builder tests..."
  );

  const suffix =
    Date.now();

  const [
    ownerRole,
    managerRole,
    peopleAccess,
    peopleStatusManage,
    peopleDelete,
    auditAccess,
  ] =
    await Promise.all([
      prisma.role.findUnique({
        where: {
          systemKey:
            "OWNER",
        },
      }),

      prisma.role.findUnique({
        where: {
          systemKey:
            "MANAGER",
        },
      }),

      prisma.permission.findUnique({
        where: {
          key:
            "people.access",
        },
      }),

      prisma.permission.findUnique({
        where: {
          key:
            "people.status.manage",
        },
      }),

      prisma.permission.findUnique({
        where: {
          key:
            "people.delete",
        },
      }),

      prisma.permission.findUnique({
        where: {
          key:
            "audit.access",
        },
      }),
    ]);

  assert.ok(ownerRole);
  assert.ok(managerRole);
  assert.ok(peopleAccess);
  assert.ok(peopleStatusManage);
  assert.ok(peopleDelete);
  assert.ok(auditAccess);

  const owner =
    await prisma.user.create({
      data: {
        name:
          "Role Builder Test Owner",
        email:
          `role-builder-owner-${suffix}@example.test`,
        status:
          UserStatus.ACTIVE,
        roleMemberships: {
          create: {
            roleId:
              ownerRole.id,
          },
        },
      },
    });

  const manager =
    await prisma.user.create({
      data: {
        name:
          "Role Builder Test Manager",
        email:
          `role-builder-manager-${suffix}@example.test`,
        status:
          UserStatus.ACTIVE,
        roleMemberships: {
          create: {
            roleId:
              managerRole.id,
          },
        },
      },
    });

  let customRoleId:
    string | null =
    null;

  let holderId:
    string | null =
    null;

  try {
    const ownerAccess =
      await getAccessContext(
        owner.id
      );

    const managerAccess =
      await getAccessContext(
        manager.id
      );

    await expectRoleError(
      () =>
        getRoleBuilderData(
          managerAccess
        ),
      "ROLE_MANAGEMENT_REQUIRED"
    );

    console.log(
      "✓ non-Owner cannot open Role Builder"
    );

    const builder =
      await getRoleBuilderData(
        ownerAccess
      );

    const builderPermissionKeys =
      new Set(
        builder.permissions.map(
          (permission) =>
            permission.key
        )
      );

    assert.equal(
      builderPermissionKeys.has(
        "people.status.manage"
      ),
      false
    );

    assert.equal(
      builderPermissionKeys.has(
        "people.delete"
      ),
      false
    );

    assert.equal(
      builderPermissionKeys.has(
        "audit.access"
      ),
      false
    );

    assert.equal(
      builder.roles.some(
        (role) =>
          role.permissions.some(
            (permission) =>
              permission.key ===
                "people.status.manage" ||
              permission.key ===
                "people.delete" ||
              permission.key ===
                "audit.access"
          )
      ),
      false
    );

    console.log(
      "✓ Owner-only permissions are hidden from Role Settings"
    );

    await expectRoleError(
      () =>
        createRole(
          {
            name:
              `Forbidden Destructive Role ${suffix}`,
            rank:
              9,
            dataScope:
              RoleDataScope.SELF,
            permissionIds: [
              peopleStatusManage.id,
              peopleDelete.id,
            ],
          },
          ownerAccess
        ),
      "INVALID_PERMISSIONS"
    );

    console.log(
      "✓ destructive Owner-only permissions cannot be assigned through the role service"
    );

    await expectRoleError(
      () =>
        createRole(
          {
            name:
              `Forbidden Audit Role ${suffix}`,
            rank:
              10,
            dataScope:
              RoleDataScope.SELF,
            permissionIds: [
              auditAccess.id,
            ],
          },
          ownerAccess
        ),
      "INVALID_PERMISSIONS"
    );

    console.log(
      "✓ Audit Log permission cannot be assigned through the role service"
    );

    assert.ok(
      builder.roles.length >=
        9
    );

    assert.equal(
      builder.roles.some(
        (
          role
        ) =>
          role.systemKey ===
          "OWNER"
      ),
      false
    );

    console.log(
      "✓ Role Builder hides the system-managed Owner role"
    );

    await expectRoleError(
      () =>
        updateRole(
          ownerRole.id,
          {
            name:
              ownerRole.name,
            rank:
              1,
            dataScope:
              ownerRole.dataScope,
            permissionIds:
              [],
          },
          ownerAccess
        ),
      "OWNER_ROLE_IMMUTABLE"
    );

    console.log(
      "✓ Owner role cannot be edited through the role-management service"
    );

    const customRole =
      await createRole(
        {
          name:
            `Tier Test ${suffix}`,
          rank:
            7,
          dataScope:
            RoleDataScope.SELF,
          permissionIds: [
            peopleAccess.id,
          ],
        },
        ownerAccess
      );

    customRoleId =
      customRole.id;

    assert.equal(
      customRole.isSystem,
      false
    );

    assert.equal(
      customRole.rank,
      7
    );

    console.log(
      "✓ Owner can create a ranked custom role"
    );

    await expectRoleError(
      () =>
        archiveRole(
          customRole.id,
          managerAccess
        ),
      "OWNER_REQUIRED"
    );

    console.log(
      "✓ non-Owner cannot archive a custom role even through the role service"
    );

    await expectRoleError(
      () =>
        createRole(
          {
            name:
              `tier test ${suffix}`,
            rank:
              8,
            dataScope:
              RoleDataScope.SELF,
            permissionIds:
              [],
          },
          ownerAccess
        ),
      "ROLE_NAME_IN_USE"
    );

    console.log(
      "✓ duplicate role names are rejected case-insensitively"
    );

    await expectRoleError(
      () =>
        createRole(
          {
            name:
              `Unranked Custom ${suffix}`,
            rank:
              null,
            dataScope:
              RoleDataScope.SELF,
            permissionIds:
              [],
          },
          ownerAccess
        ),
      "INVALID_ROLE_RANK"
    );

    console.log(
      "✓ custom roles cannot be created outside the ranked chain"
    );

    await expectRoleError(
      () =>
        updateRole(
          managerRole.id,
          {
            name:
              managerRole.name,
            rank:
              null,
            dataScope:
              managerRole.dataScope,
            permissionIds:
              builder.roles
                .find(
                  (
                    role
                  ) =>
                    role.id ===
                    managerRole.id
                )
                ?.permissions
                .map(
                  (
                    permission
                  ) =>
                    permission.id
                ) ??
              [],
          },
          ownerAccess
        ),
      "INVALID_ROLE_RANK"
    );

    console.log(
      "✓ default ranked operational roles cannot be removed from the rank chain"
    );

    const holder =
      await prisma.user.create({
        data: {
          name:
            "Custom Role Holder",
          email:
            `custom-role-holder-${suffix}@example.test`,
          status:
            UserStatus.ACTIVE,
          roleMemberships: {
            create: {
              roleId:
                customRole.id,
            },
          },
        },
      });

    holderId =
      holder.id;

    const withHolder =
      await getRoleBuilderData(
        ownerAccess
      );

    const roleWithCount =
      withHolder.roles.find(
        (
          role
        ) =>
          role.id ===
          customRole.id
      );

    assert.equal(
      roleWithCount
        ?.affectedUserCount,
      1
    );

    console.log(
      "✓ affected-user count reflects current role holders"
    );

    const updated =
      await updateRole(
        customRole.id,
        {
          name:
            `Tier Test Updated ${suffix}`,
          rank:
            8,
          dataScope:
            RoleDataScope.SELF_AND_TEAM,
          permissionIds:
            [
              peopleAccess.id,
            ],
        },
        ownerAccess
      );

    assert.equal(
      updated.rank,
      8
    );

    assert.equal(
      updated.dataScope,
      RoleDataScope.SELF_AND_TEAM
    );

    console.log(
      "✓ custom role edits apply successfully before archive"
    );

    const archived =
      await archiveRole(
        customRole.id,
        ownerAccess
      );

    assert.equal(
      archived.isArchived,
      true
    );

    assert.equal(
      archived.affectedUserCount,
      1
    );

    const archivedHolderAccess =
      await getAccessContext(
        holder.id
      );

    assert.equal(
      archivedHolderAccess.roles.some(
        (role) =>
          role.id === customRole.id
      ),
      false
    );

    assert.equal(
      archivedHolderAccess.permissions.has(
        "people.access"
      ),
      false
    );

    console.log(
      "✓ archived roles retain user links but stop granting effective access"
    );

    const archivedBuilder =
      await getRoleBuilderData(
        ownerAccess
      );

    const archivedBuilderRole =
      archivedBuilder.roles.find(
        (role) =>
          role.id === customRole.id
      );

    assert.equal(
      archivedBuilderRole?.isArchived,
      true
    );

    assert.equal(
      archivedBuilderRole?.affectedUserCount,
      1
    );

    console.log(
      "✓ archived roles remain visible in Role Settings with retained relationships"
    );

    await expectRoleError(
      () =>
        updateRole(
          customRole.id,
          {
            name:
              updated.name,
            rank:
              updated.rank,
            dataScope:
              updated.dataScope,
            permissionIds:
              updated.permissions.map(
                (permission) =>
                  permission.id
              ),
          },
          ownerAccess
        ),
      "ROLE_ARCHIVED"
    );

    console.log(
      "✓ archived roles cannot be edited until reactivated"
    );

    await expectRoleError(
      () =>
        archiveRole(
          ownerRole.id,
          ownerAccess
        ),
      "SYSTEM_ROLE_ARCHIVE_FORBIDDEN"
    );

    console.log("✓ Owner role cannot be archived");

    const archivedManager = await archiveRole(
      managerRole.id,
      ownerAccess
    );
    assert.equal(archivedManager.isArchived, true);
    const restoredManager = await reactivateRole(
      managerRole.id,
      ownerAccess
    );
    assert.equal(restoredManager.isArchived, false);

    console.log("✓ default non-Owner roles can be archived and reactivated");

    const reactivated =
      await reactivateRole(
        customRole.id,
        ownerAccess
      );

    assert.equal(
      reactivated.isArchived,
      false
    );

    const restoredHolderAccess =
      await getAccessContext(
        holder.id
      );

    assert.equal(
      restoredHolderAccess.roles.some(
        (role) =>
          role.id === customRole.id
      ),
      true
    );

    assert.equal(
      restoredHolderAccess.permissions.has(
        "people.access"
      ),
      true
    );

    console.log(
      "✓ reactivation restores the retained role assignment and permissions"
    );

    console.log("");
    console.log(
      "All Step 1 Role Builder tests passed."
    );
  } finally {
    if (
      holderId
    ) {
      await prisma.user.deleteMany({
        where: {
          id:
            holderId,
        },
      });
    }

    if (
      customRoleId
    ) {
      await prisma.userRole.deleteMany({
        where: {
          roleId:
            customRoleId,
        },
      });

      await prisma.role.deleteMany({
        where: {
          id:
            customRoleId,
          isSystem:
            false,
        },
      });
    }

    await prisma.user.deleteMany({
      where: {
        id: {
          in: [
            owner.id,
            manager.id,
          ],
        },
      },
    });
  }
}

main()
  .catch(
    (
      error
    ) => {
      console.error(
        "Step 1 Role Builder test failed:",
        error
      );

      process.exit(1);
    }
  )
  .finally(
    async () => {
      await prisma.$disconnect();
    }
  );
