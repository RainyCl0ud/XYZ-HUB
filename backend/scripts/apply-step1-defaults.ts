import {
  PrismaClient,
} from "@prisma/client";

const prisma =
  new PrismaClient();

async function main() {
  const [
    devRole,
    auditPermission,
  ] =
    await Promise.all([
      prisma.role.findUnique({
        where: {
          systemKey:
            "DEV",
        },
        select: {
          id:
            true,
        },
      }),

      prisma.permission.findUnique({
        where: {
          key:
            "audit.view",
        },
        select: {
          id:
            true,
        },
      }),
    ]);

  if (
    !devRole ||
    !auditPermission
  ) {
    throw new Error(
      "DEV role or audit.view permission is missing. Run the normal seed first."
    );
  }

  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId:
          devRole.id,
        permissionId:
          auditPermission.id,
      },
    },
    update: {},
    create: {
      roleId:
        devRole.id,
      permissionId:
        auditPermission.id,
    },
  });

  console.log(
    "Step 1 clarification applied: Dev can view the Audit Log."
  );
}

main()
  .catch(
    (
      error
    ) => {
      console.error(
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
