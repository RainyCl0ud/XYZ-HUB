/// <reference types="node" />

import {
  PrismaClient,
  RoleDataScope,
} from "@prisma/client";

import {
  MANAGED_PERMISSION_KEYS,
  PERMISSION_CATALOG,
} from "../src/permissions/permission-catalog.js";

const prisma = new PrismaClient();

const permissions =
  PERMISSION_CATALOG;


const defaultRoles = [
  {
    systemKey: "OWNER",
    name: "Owner",
    rank: 1,
    dataScope: RoleDataScope.ALL,
  },
  {
    systemKey: "OPS_MANAGER",
    name: "Ops Manager",
    rank: 2,
    dataScope: RoleDataScope.ALL,
  },
  {
    systemKey: "MANAGER",
    name: "Manager",
    rank: 3,
    dataScope: RoleDataScope.SELF_AND_TEAM,
  },
  {
    systemKey: "QC",
    name: "QC",
    rank: 4,
    dataScope: RoleDataScope.SELF_AND_TEAM,
  },
  {
    systemKey: "CHATTER",
    name: "Chatter",
    rank: 5,
    dataScope: RoleDataScope.SELF,
  },
  {
    systemKey: "TRIAL_CHATTER",
    name: "Trial Chatter",
    rank: 6,
    dataScope: RoleDataScope.SELF,
  },
  {
    systemKey: "DEV",
    name: "Dev",
    rank: null,
    dataScope: RoleDataScope.ALL,
  },
  {
    systemKey: "ACCOUNTANT",
    name: "Accountant",
    rank: null,
    dataScope: RoleDataScope.ALL,
  },
  {
    systemKey: "MODEL",
    name: "Model",
    rank: null,
    dataScope: RoleDataScope.SELF,
  },
  {
    systemKey: "GENERAL_STAFF",
    name: "General Staff",
    rank: null,
    dataScope: RoleDataScope.SELF,
  },
] as const;

const defaultRolePermissions: Record<
  string,
  readonly string[]
> = {
  OWNER:
    MANAGED_PERMISSION_KEYS,

  OPS_MANAGER: [
    "dashboard.view",

    "people.access",
    "people.profile.view",
    "people.create",
    "people.assign_roles",

    "quality.access",
    "quality.incidents.view",
    "quality.incidents.create",
    "quality.incidents.resolve",
    "quality.incidents.void",
    "quality.chatters.view",
    "quality.chatters.manage",
    "quality.rules.view",
    "quality.rules.manage",

    "strikes.access",
    "strikes.view",
    "strikes.issue",
    "strikes.void",
    "strikes.reasons.view",
    "strikes.reasons.create",
    "strikes.reasons.edit",
    "strikes.reasons.archive",
    "strikes.ladder.view",
    "strikes.ladder.edit",

    "models.access",
    "models.create",
    "models.edit",
    "models.status.manage",
  ],

  MANAGER: [
    "dashboard.view",

    "people.access",
    "people.profile.view",
    "people.create",
    "people.assign_roles",

    "quality.access",
    "quality.incidents.view",
    "quality.incidents.create",
    "quality.incidents.resolve",
    "quality.incidents.void",
    "quality.chatters.view",
    "quality.chatters.manage",
    "quality.rules.view",
    "quality.rules.manage",

    "strikes.access",
    "strikes.view",
    "strikes.issue",
  ],

  QC: [
    "dashboard.view",

    "quality.access",
    "quality.incidents.view",
    "quality.chatters.view",

    "strikes.access",
    "strikes.view",
    "strikes.issue",
  ],

  CHATTER: [
    "dashboard.view",
  ],

  TRIAL_CHATTER: [
    "dashboard.view",
  ],

  DEV: [
    "dashboard.view",

    "quality.access",
    "quality.incidents.view",
    "quality.incidents.create",
    "quality.incidents.resolve",
    "quality.incidents.void",
    "quality.chatters.view",
    "quality.chatters.manage",
    "quality.rules.view",
    "quality.rules.manage",
  ],

  ACCOUNTANT: [
    "dashboard.view",
  ],

  MODEL: [
    "dashboard.view",
  ],

  GENERAL_STAFF: [
    "dashboard.view",
  ],
};


async function main() {
async function main() {
  console.log("Starting XYZ Hub bootstrap seed...");

  await prisma.$transaction(async (tx) => {
    /*
     * =====================================================
     * PERMISSION CATALOG
     * =====================================================
     */

    const permissionByKey = new Map<
      string,
      string
    >();

    for (const permission of permissions) {
      const savedPermission =
        await tx.permission.upsert({
          where: {
            key: permission.key,
          },

          update: {
            name: permission.name,
            description:
              permission.description,
            pageKey: permission.pageKey,
            categoryKey:
              permission.categoryKey,
            actionKey:
              permission.actionKey,
          },

          create: {
            key: permission.key,
            name: permission.name,
            description:
              permission.description,
            pageKey: permission.pageKey,
            categoryKey:
              permission.categoryKey,
            actionKey:
              permission.actionKey,
          },
        });

      permissionByKey.set(
        permission.key,
        savedPermission.id
      );
    }

    /*
     * =====================================================
     * DEFAULT SYSTEM ROLES
     * =====================================================
     *
     * Important:
     * Existing system roles are NOT overwritten.
     *
     * Owners are allowed to edit the default roles later,
     * so running this bootstrap again must not reset
     * those changes.
     */

    for (const roleDefinition of defaultRoles) {
      const existingRole =
        await tx.role.findUnique({
          where: {
            systemKey:
              roleDefinition.systemKey,
          },
        });

      if (existingRole) {
        console.log(
          `Skipping existing role: ${existingRole.name}`
        );

        continue;
      }

      const createdRole =
        await tx.role.create({
          data: {
            systemKey:
              roleDefinition.systemKey,

            name: roleDefinition.name,

            rank: roleDefinition.rank,

            dataScope:
              roleDefinition.dataScope,

            isSystem: true,

            landingPath: null,
          },
        });

      console.log(
        `Created role: ${createdRole.name}`
      );

      /*
       * Add the role's initial/default permissions.
       *
       * These are only added when the system role
       * itself is first created.
       *
       * Re-running the seed later therefore will NOT
       * restore permissions that an Owner intentionally
       * removed through the Role Builder.
       */

      const permissionKeys =
        defaultRolePermissions[
          roleDefinition.systemKey
        ] ?? [];

      for (const permissionKey of permissionKeys) {
        const permissionId =
          permissionByKey.get(
            permissionKey
          );

        if (!permissionId) {
          throw new Error(
            `Missing permission: ${permissionKey}`
          );
        }

        await tx.rolePermission.create({
          data: {
            roleId: createdRole.id,
            permissionId,
          },
        });
      }
    }
  });

  console.log("");
  console.log(
    "XYZ Hub bootstrap seed completed successfully."
  );
}

main()
  .catch((error) => {
    console.error(
      "Seed failed:",
      error
    );

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
