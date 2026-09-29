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
  createRole,
  deleteRole,
  getRoleBuilderData,
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
    peopleManage,
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
            "people.manage",
        },
      }),
    ]);

  assert.ok(ownerRole);
  assert.ok(managerRole);
  assert.ok(peopleManage);

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
            peopleManage.id,
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

    await expectRoleError(
      () =>
        deleteRole(
          customRole.id,
          ownerAccess
        ),
      "ROLE_IN_USE"
    );

    console.log(
      "✓ custom role cannot be deleted while assigned"
    );

    await expectRoleError(
      () =>
        deleteRole(
          managerRole.id,
          ownerAccess
        ),
      "SYSTEM_ROLE_DELETE_FORBIDDEN"
    );

    console.log(
      "✓ default roles cannot be deleted"
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
            [],
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
      "✓ custom role edits apply successfully"
    );

    await prisma.userRole.deleteMany({
      where: {
        userId:
          holder.id,
        roleId:
          customRole.id,
      },
    });

    const deleted =
      await deleteRole(
        customRole.id,
        ownerAccess
      );

    customRoleId =
      null;

    assert.equal(
      deleted.id,
      customRole.id
    );

    console.log(
      "✓ unused custom role can be deleted"
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
