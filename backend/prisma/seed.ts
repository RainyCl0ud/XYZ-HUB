/// <reference types="node" />

import {
  PrismaClient,
  RoleDataScope,
} from "@prisma/client";

const prisma = new PrismaClient();

const permissions = [
  {
    key: "people.manage",
    name: "Manage People",
    description:
      "Invite people and manage their roles and model assignments within the user's allowed rank and model scope.",
    pageKey: "people",
    categoryKey: "people",
    actionKey: "manage",
  },
  {
    key: "people.deactivate",
    name: "Deactivate People",
    description:
      "Deactivate people the user is allowed to manage.",
    pageKey: "people",
    categoryKey: "people",
    actionKey: "deactivate",
  },
  {
    key: "people.delete",
    name: "Delete People",
    description:
      "Permanently delete a person. Owner only by default.",
    pageKey: "people",
    categoryKey: "people",
    actionKey: "delete",
  },
  {
    key: "roles.manage",
    name: "Manage Roles",
    description:
      "Create, edit and delete custom roles through the role builder.",
    pageKey: "roles",
    categoryKey: "roles",
    actionKey: "manage",
  },
  {
    key: "strikes.view",
    name: "View Strikes",
    description:
      "View disciplinary Strike records within the user's allowed organization scope.",
    pageKey: "strikes",
    categoryKey: "strikes",
    actionKey: "view",
  },
  {
    key: "strikes.issue",
    name: "Issue Strikes",
    description:
      "Issue disciplinary Strikes to eligible employees within the user's allowed organization and rank scope.",
    pageKey: "strikes",
    categoryKey: "strikes",
    actionKey: "issue",
  },
  {
    key: "strikes.void",
    name: "Void Strikes",
    description:
      "Void previously issued disciplinary Strikes within the user's allowed organization and rank scope.",
    pageKey: "strikes",
    categoryKey: "strikes",
    actionKey: "void",
  },
  {
    key: "strikes.configure",
    name: "Configure Strikes",
    description:
      "Manage Strike reasons and Strike policy configuration.",
    pageKey: "strikes",
    categoryKey: "strikes",
    actionKey: "configure",
  },
  {
    key: "audit.view",
    name: "View Audit Log",
    description:
      "View and search the append-only audit log.",
    pageKey: "audit",
    categoryKey: "audit",
    actionKey: "view",
  },
  {
    key: "two_factor.reset",
    name: "Reset 2FA",
    description:
      "Reset another user's two-factor authentication setup.",
    pageKey: "people",
    categoryKey: "security",
    actionKey: "reset_2fa",
  },
] as const;

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
  OWNER: [
    "people.manage",
    "people.deactivate",
    "people.delete",
    "roles.manage",
    "strikes.view",
    "strikes.issue",
    "strikes.void",
    "strikes.configure",
    "audit.view",
    "two_factor.reset",
  ],

  OPS_MANAGER: [
    "people.manage",
    "people.deactivate",
    "strikes.view",
    "strikes.issue",
    "strikes.void",
    "strikes.configure",
  ],

  MANAGER: [
    "people.manage",
    "people.deactivate",
    "strikes.view",
    "strikes.issue",
  ],

  QC: [
    "strikes.view",
    "strikes.issue",
  ],
  CHATTER: [],
  TRIAL_CHATTER: [],
  DEV: [],
  ACCOUNTANT: [],
  MODEL: [],
  GENERAL_STAFF: [],
};

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
