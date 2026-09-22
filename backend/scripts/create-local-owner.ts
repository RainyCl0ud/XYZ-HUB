/// <reference types="node" />

import "dotenv/config";

import {
  PrismaClient,
  UserStatus,
} from "@prisma/client";

import {
  hashPassword,
} from "../src/services/password.js";

const prisma =
  new PrismaClient();

async function main() {
  console.log(
    "Creating local Login Gate test Owner..."
  );

  /*
   * SAFETY GUARD
   *
   * This script must NEVER run against
   * Railway staging or production.
   */
  const databaseUrl =
    process.env.DATABASE_URL ?? "";

  const isLocalDatabase =
    databaseUrl.includes(
      "localhost"
    ) ||
    databaseUrl.includes(
      "127.0.0.1"
    );

  if (!isLocalDatabase) {
    throw new Error(
      "Refusing to create test Owner because DATABASE_URL is not local."
    );
  }

  const email =
    process.env.LOCAL_AUTH_TEST_EMAIL
      ?.trim()
      .toLowerCase();

  const password =
    process.env.LOCAL_AUTH_TEST_PASSWORD;

  if (
    !email ||
    !password
  ) {
    throw new Error(
      "LOCAL_AUTH_TEST_EMAIL and LOCAL_AUTH_TEST_PASSWORD must be configured."
    );
  }

  const ownerRole =
    await prisma.role.findUnique({
      where: {
        systemKey:
          "OWNER",
      },
    });

  if (!ownerRole) {
    throw new Error(
      "Owner role does not exist. Run the bootstrap seed first."
    );
  }

  const passwordHash =
    await hashPassword(
      password
    );

  const user =
    await prisma.user.upsert({
      where: {
        email,
      },

      update: {
        name:
          "Local Test Owner",

        passwordHash,

        status:
          UserStatus.ACTIVE,

        deactivatedAt:
          null,
      },

      create: {
        name:
          "Local Test Owner",

        email,

        passwordHash,

        status:
          UserStatus.ACTIVE,
      },
    });

  const existingOwnerRole =
    await prisma.userRole.findFirst({
      where: {
        userId:
          user.id,

        roleId:
          ownerRole.id,
      },
    });

  if (!existingOwnerRole) {
    await prisma.userRole.create({
      data: {
        userId:
          user.id,

        roleId:
          ownerRole.id,
      },
    });
  }

  console.log("");
  console.log(
    "Local test Owner ready."
  );

  console.log(
    `Email: ${email}`
  );

  console.log(
    "Password loaded from LOCAL_AUTH_TEST_PASSWORD."
  );

  console.log(
    `User ID: ${user.id}`
  );

  console.log(
    "Role: Owner"
  );

  console.log("");
}

main()
  .catch((error) => {
    console.error(
      "Local Owner setup failed:",
      error
    );

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });