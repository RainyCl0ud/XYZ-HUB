/// <reference types="node" />

import "dotenv/config";

import {
  ChatterStatus,
  PrismaClient,
  UserStatus,
} from "@prisma/client";

import {
  OWNER_ONLY_PERMISSION_KEYS,
} from "../src/permissions/permission-catalog.js";

import {
  hashPassword,
} from "../src/services/password.js";

const prisma =
  new PrismaClient();

const ROOT_TEAM_GROUP_ID =
  "xyz_management_root";

const ROOT_TEAM_GROUP_NAME =
  "XYZ Management";

const RESET_CONFIRMATION =
  "RESET_XYZ_STAGING";

const DEMO_PASSWORD =
  "Stagecoach!1899";

const TEST_USERS = [
  {
    name:
      "Dim",
    email:
      "dim@xyz.staging.test",
    roleKey:
      "OWNER",
  },
  {
    name:
      "Mei",
    email:
      "mei@xyz.staging.test",
    roleKey:
      "OWNER",
  },
  {
    name:
      "Dutch Van Der Linde",
    email:
      "dutch.van.der.linde@xyz.staging.test",
    roleKey:
      "OPS_MANAGER",
  },
  {
    name:
      "Hosea Matthews",
    email:
      "hosea.matthews@xyz.staging.test",
    roleKey:
      "MANAGER",
  },
  {
    name:
      "Micah Bell",
    email:
      "micah.bell@xyz.staging.test",
    roleKey:
      "MANAGER",
  },
  {
    name:
      "Susan Grimshaw",
    email:
      "susan.grimshaw@xyz.staging.test",
    roleKey:
      "QC",
  },
  {
    name:
      "Arthur Morgan",
    email:
      "arthur.morgan@xyz.staging.test",
    roleKey:
      "CHATTER",
  },
  {
    name:
      "John Marston",
    email:
      "john.marston@xyz.staging.test",
    roleKey:
      "CHATTER",
  },
  {
    name:
      "Charles Smith",
    email:
      "charles.smith@xyz.staging.test",
    roleKey:
      "CHATTER",
  },
  {
    name:
      "Javier Escuella",
    email:
      "javier.escuella@xyz.staging.test",
    roleKey:
      "CHATTER",
  },
  {
    name:
      "Sadie Adler",
    email:
      "sadie.adler@xyz.staging.test",
    roleKey:
      "CHATTER",
  },
] as const;

const REQUIRED_ROLE_KEYS =
  [
    "OWNER",
    "OPS_MANAGER",
    "MANAGER",
    "QC",
    "CHATTER",
  ] as const;

function normalizeName(
  value:
    string
) {
  return value
    .trim()
    .toLocaleLowerCase();
}

function requireStagingEnvironment(
  destructive:
    boolean
) {
  const environmentName =
    (
      process.env
        .RAILWAY_ENVIRONMENT_NAME ??
      process.env
        .RAILWAY_ENVIRONMENT ??
      ""
    )
      .trim()
      .toLowerCase();

  if (
    environmentName !==
    "staging"
  ) {
    throw new Error(
      `Refusing reset because Railway environment is "${environmentName || "unset"}", not "Staging".`
    );
  }

  if (
    !process.env
      .DATABASE_URL
  ) {
    throw new Error(
      "Refusing reset because DATABASE_URL is missing."
    );
  }

  if (
    destructive &&
    process.env
      .STAGING_RESET_CONFIRM !==
      RESET_CONFIRMATION
  ) {
    throw new Error(
      `Refusing destructive reset. Set STAGING_RESET_CONFIRM=${RESET_CONFIRMATION} for the reset deployment only.`
    );
  }
}

function validatePlan() {
  const names =
    TEST_USERS.map(
      (
        user
      ) =>
        normalizeName(
          user.name
        )
    );

  const emails =
    TEST_USERS.map(
      (
        user
      ) =>
        user.email
          .trim()
          .toLowerCase()
    );

  if (
    new Set(
      names
    ).size !==
    names.length
  ) {
    throw new Error(
      "Duplicate test employee name in reset plan."
    );
  }

  if (
    new Set(
      emails
    ).size !==
    emails.length
  ) {
    throw new Error(
      "Duplicate test employee email in reset plan."
    );
  }
}

async function loadRequiredRoles() {
  const roles =
    await prisma.role.findMany({
      where: {
        systemKey: {
          in:
            [
              ...REQUIRED_ROLE_KEYS,
            ],
        },
      },
      select: {
        id:
          true,
        systemKey:
          true,
        name:
          true,
      },
    });

  const byKey =
    new Map(
      roles.map(
        (
          role
        ) => [
          role.systemKey,
          role,
        ]
      )
    );

  for (
    const key
    of REQUIRED_ROLE_KEYS
  ) {
    if (
      !byKey.has(
        key
      )
    ) {
      throw new Error(
        `Required system role is missing: ${key}`
      );
    }
  }

  return byKey;
}

async function loadPreservedOwners(
  ownerRoleId:
    string
) {
  return prisma.user.findMany({
    where: {
      roleMemberships: {
        some: {
          roleId:
            ownerRoleId,
        },
      },
    },
    select: {
      id:
        true,
      name:
        true,
      email:
        true,
      passwordHash:
        true,
      status:
        true,
      emailVerifiedAt:
        true,
      lastSignInAt:
        true,
      _count: {
        select: {
          sessions:
            true,
          twoFactorMethods:
            true,
        },
      },
    },
    orderBy: {
      email:
        "asc",
    },
  });
}

async function printDryRun() {
  requireStagingEnvironment(
    false
  );

  validatePlan();

  const roles =
    await loadRequiredRoles();

  const ownerRole =
    roles.get(
      "OWNER"
    );

  if (
    !ownerRole
  ) {
    throw new Error(
      "Owner role is missing."
    );
  }

  const owners =
    await loadPreservedOwners(
      ownerRole.id
    );

  const counts = {
    users:
      await prisma.user.count(),
    chatters:
      await prisma.chatter.count(),
    incidents:
      await prisma.incident.count(),
    strikes:
      await prisma.strike.count(),
    auditEvents:
      await prisma.auditEvent.count(),
    creatorsPreserved:
      await prisma.agencyModel.count(),
    rulesPreserved:
      await prisma.rule.count(),
    strikeReasonsPreserved:
      await prisma.strikeReason.count(),
    ladderVersionsPreserved:
      await prisma.strikeLadderVersion.count(),
  };

  console.log(
    "STAGING RESET DRY RUN - NO DATA CHANGED"
  );

  console.log(
    "Existing Owner accounts preserved for login safety:"
  );

  for (
    const owner
    of owners
  ) {
    console.log(
      `- ${owner.name} <${owner.email}>`
    );
  }

  console.table(
    counts
  );

  console.log(
    "Configured roles, permissions, creators, QA rules/options, Strike Reasons, and Strike Ladder configuration will be preserved."
  );

  console.log(
    "Incidents, Strikes, Chatter profiles, audit history, non-Owner users, non-root team groups, and employee model assignments will be cleared."
  );
}

async function performReset() {
  requireStagingEnvironment(
    true
  );

  validatePlan();

  const roles =
    await loadRequiredRoles();

  const ownerRole =
    roles.get(
      "OWNER"
    );

  if (
    !ownerRole
  ) {
    throw new Error(
      "Owner role is missing."
    );
  }

  const ownerSnapshots =
    await loadPreservedOwners(
      ownerRole.id
    );

  if (
    ownerSnapshots.length ===
    0
  ) {
    throw new Error(
      "No existing Owner account exists. Reset aborted to prevent Staging lockout."
    );
  }

  const preservedOwnerIds =
    ownerSnapshots.map(
      (
        owner
      ) =>
        owner.id
    );

  const preservedOwnerByName =
    new Map(
      ownerSnapshots.map(
        (
          owner
        ) => [
          normalizeName(
            owner.name
          ),
          owner,
        ]
      )
    );

  const demoPasswordHash =
    await hashPassword(
      DEMO_PASSWORD
    );

  const now =
    new Date();

  const summary =
    await prisma.$transaction(
      async (
        tx
      ) => {
        await tx.teamGroup.upsert({
          where: {
            id:
              ROOT_TEAM_GROUP_ID,
          },
          update: {
            name:
              ROOT_TEAM_GROUP_NAME,
            parentId:
              null,
            isRoot:
              true,
          },
          create: {
            id:
              ROOT_TEAM_GROUP_ID,
            name:
              ROOT_TEAM_GROUP_NAME,
            parentId:
              null,
            isRoot:
              true,
          },
        });

        /*
         * Clear mutable client-test activity.
         * Configuration/catalog records intentionally remain.
         */
        await tx.strike.deleteMany();
        await tx.incident.deleteMany();
        await tx.chatter.deleteMany();
        await tx.auditEvent.deleteMany();
        await tx.userModelAssignment.deleteMany();

        /*
         * Preserve existing Owner authentication so client/admin
         * access is not destroyed by the Staging reset.
         */
        await tx.userRole.deleteMany({
          where: {
            userId: {
              in:
                preservedOwnerIds,
            },
            roleId: {
              not:
                ownerRole.id,
            },
          },
        });

        await tx.user.updateMany({
          where: {
            id: {
              in:
                preservedOwnerIds,
            },
          },
          data: {
            teamGroupId:
              ROOT_TEAM_GROUP_ID,
          },
        });

        /*
         * Remove all old non-Owner test employees.
         * Their auth/session/invite records cascade with the User row.
         */
        await tx.user.deleteMany({
          where: {
            id: {
              notIn:
                preservedOwnerIds,
            },
          },
        });

        /*
         * Reset organization test data to the required root only.
         */
        await tx.teamGroup.updateMany({
          where: {
            id: {
              not:
                ROOT_TEAM_GROUP_ID,
            },
          },
          data: {
            parentId:
              null,
            isRoot:
              false,
          },
        });

        await tx.teamGroup.deleteMany({
          where: {
            id: {
              not:
                ROOT_TEAM_GROUP_ID,
            },
          },
        });

        /*
         * Owner-only actions are runtime capabilities, not configurable
         * RolePermission assignments.
         */
        const ownerOnlyPermissions =
          await tx.permission.findMany({
            where: {
              key: {
                in:
                  [
                    ...OWNER_ONLY_PERMISSION_KEYS,
                  ],
              },
            },
            select: {
              id:
                true,
            },
          });

        if (
          ownerOnlyPermissions.length >
          0
        ) {
          await tx.rolePermission.deleteMany({
            where: {
              permissionId: {
                in:
                  ownerOnlyPermissions.map(
                    (
                      permission
                    ) =>
                      permission.id
                  ),
              },
            },
          });
        }

        /*
         * Ensure named Owner test employees exist.
         * Existing Dim/Mei Owner identities keep their credentials.
         * Missing ones are created as safe .test accounts.
         */
        const testUserIds =
          new Map<
            string,
            string
          >();

        for (
          const definition
          of TEST_USERS
        ) {
          if (
            definition.roleKey ===
            "OWNER"
          ) {
            const existingOwner =
              preservedOwnerByName.get(
                normalizeName(
                  definition.name
                )
              );

            if (
              existingOwner
            ) {
              testUserIds.set(
                definition.name,
                existingOwner.id
              );

              continue;
            }
          }

          const role =
            roles.get(
              definition.roleKey
            );

          if (
            !role
          ) {
            throw new Error(
              `Required role disappeared during reset: ${definition.roleKey}`
            );
          }

          const created =
            await tx.user.create({
              data: {
                name:
                  definition.name,
                email:
                  definition.email,
                passwordHash:
                  demoPasswordHash,
                status:
                  UserStatus.ACTIVE,
                emailVerifiedAt:
                  now,
                teamGroupId:
                  ROOT_TEAM_GROUP_ID,
              },
            });

          await tx.userRole.create({
            data: {
              userId:
                created.id,
              roleId:
                role.id,
              assignedByUserId:
                preservedOwnerIds[0] ??
                null,
            },
          });

          testUserIds.set(
            definition.name,
            created.id
          );
        }

        /*
         * Normalize Dim/Mei role membership if their preserved
         * identities already existed.
         */
        for (
          const definition
          of TEST_USERS
        ) {
          if (
            definition.roleKey !==
            "OWNER"
          ) {
            continue;
          }

          const userId =
            testUserIds.get(
              definition.name
            );

          if (
            !userId
          ) {
            throw new Error(
              `Owner test user missing after reset: ${definition.name}`
            );
          }

          await tx.userRole.upsert({
            where: {
              userId_roleId: {
                userId,
                roleId:
                  ownerRole.id,
              },
            },
            update: {},
            create: {
              userId,
              roleId:
                ownerRole.id,
              assignedByUserId:
                null,
            },
          });

          await tx.user.update({
            where: {
              id:
                userId,
            },
            data: {
              name:
                definition.name,
              teamGroupId:
                ROOT_TEAM_GROUP_ID,
            },
          });
        }

        /*
         * Chatter-role employees need linked QA profiles so existing
         * QA/Incident/Strike workflows remain testable.
         */
        for (
          const definition
          of TEST_USERS
        ) {
          if (
            definition.roleKey !==
            "CHATTER"
          ) {
            continue;
          }

          const userId =
            testUserIds.get(
              definition.name
            );

          if (
            !userId
          ) {
            throw new Error(
              `Chatter test user missing: ${definition.name}`
            );
          }

          await tx.chatter.create({
            data: {
              userId,
              name:
                definition.name,
              status:
                ChatterStatus.ACTIVE,
            },
          });
        }

        return {
          users:
            await tx.user.count(),
          testUsers:
            testUserIds.size,
          preservedOwnerAccounts:
            preservedOwnerIds.length,
          chatters:
            await tx.chatter.count(),
          incidents:
            await tx.incident.count(),
          strikes:
            await tx.strike.count(),
          auditEvents:
            await tx.auditEvent.count(),
          rolesPreserved:
            await tx.role.count(),
          permissionsPreserved:
            await tx.permission.count(),
          creatorsPreserved:
            await tx.agencyModel.count(),
          rulesPreserved:
            await tx.rule.count(),
          strikeReasonsPreserved:
            await tx.strikeReason.count(),
          ladderVersionsPreserved:
            await tx.strikeLadderVersion.count(),
        };
      },
      {
        maxWait:
          10_000,
        timeout:
          60_000,
      }
    );

  /*
   * Verify the requested employee/role matrix after mutation.
   */
  const createdUsers =
    await prisma.user.findMany({
      where: {
        name: {
          in:
            TEST_USERS.map(
              (
                user
              ) =>
                user.name
            ),
        },
      },
      select: {
        name:
          true,
        roleMemberships: {
          select: {
            role: {
              select: {
                systemKey:
                  true,
              },
            },
          },
        },
      },
    });

  for (
    const expected
    of TEST_USERS
  ) {
    const user =
      createdUsers.find(
        (
          item
        ) =>
          item.name ===
          expected.name
      );

    if (
      !user ||
      !user.roleMemberships.some(
        (
          membership
        ) =>
          membership.role.systemKey ===
          expected.roleKey
      )
    ) {
      throw new Error(
        `Post-reset verification failed for ${expected.name} -> ${expected.roleKey}.`
      );
    }
  }

  /*
   * Verify preserved Owner authentication was not changed.
   */
  const restoredOwners =
    await prisma.user.findMany({
      where: {
        id: {
          in:
            preservedOwnerIds,
        },
      },
      select: {
        id:
          true,
        passwordHash:
          true,
        status:
          true,
        emailVerifiedAt:
          true,
        lastSignInAt:
          true,
        _count: {
          select: {
            sessions:
              true,
            twoFactorMethods:
              true,
          },
        },
      },
    });

  for (
    const snapshot
    of ownerSnapshots
  ) {
    const restored =
      restoredOwners.find(
        (
          owner
        ) =>
          owner.id ===
          snapshot.id
      );

    if (
      !restored ||
      restored.passwordHash !==
        snapshot.passwordHash ||
      restored.status !==
        snapshot.status ||
      restored.emailVerifiedAt?.getTime() !==
        snapshot.emailVerifiedAt?.getTime() ||
      restored.lastSignInAt?.getTime() !==
        snapshot.lastSignInAt?.getTime() ||
      restored._count.sessions !==
        snapshot._count.sessions ||
      restored._count.twoFactorMethods !==
        snapshot._count.twoFactorMethods
    ) {
      throw new Error(
        `Owner authentication preservation failed for ${snapshot.email}.`
      );
    }
  }

  console.log(
    "STAGING RESET COMPLETED SUCCESSFULLY"
  );

  console.table(
    summary
  );

  console.log(
    "Requested test employees:"
  );

  for (
    const expected
    of TEST_USERS
  ) {
    console.log(
      `- ${expected.name}: ${expected.roleKey}`
    );
  }

  console.log(
    "Configured roles, permissions, creators, QA rules/options, Strike Reasons, and Strike Ladder configuration were preserved."
  );

  console.log(
    "Production cannot run this script because of the Railway environment guard."
  );
}

async function main() {
  const validateOnly =
    process.argv.includes(
      "--validate-only"
    );

  const dryRun =
    process.argv.includes(
      "--dry-run"
    );

  if (
    validateOnly
  ) {
    validatePlan();

    console.log(
      "Staging reset plan is valid."
    );

    return;
  }

  if (
    dryRun
  ) {
    await printDryRun();

    return;
  }

  await performReset();
}

main()
  .catch(
    (
      error
    ) => {
      console.error(
        "Staging reset failed:",
        error
      );

      process.exitCode =
        1;
    }
  )
  .finally(
    async () => {
      await prisma.$disconnect();
    }
  );
