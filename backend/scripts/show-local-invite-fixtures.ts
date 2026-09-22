/// <reference types="node" />

import "dotenv/config";

import {
  PrismaClient,
} from "@prisma/client";

const prisma =
  new PrismaClient();

async function main() {
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
      "Refusing to run because DATABASE_URL is not local."
    );
  }

  const chatterRole =
    await prisma.role.findUnique({
      where: {
        systemKey:
          "CHATTER",
      },
    });

  if (!chatterRole) {
    throw new Error(
      "Chatter role was not found."
    );
  }

  const model =
    await prisma.agencyModel.upsert({
      where: {
        name:
          "Local Invite Test Model",
      },

      update: {
        isActive:
          true,
      },

      create: {
        name:
          "Local Invite Test Model",

        isActive:
          true,
      },
    });

  console.log("");
  console.log(
    "Local invite fixtures ready."
  );

  console.log(
    `CHATTER_ROLE_ID=${chatterRole.id}`
  );

  console.log(
    `MODEL_ID=${model.id}`
  );

  console.log("");
}

main()
  .catch((error) => {
    console.error(
      "Fixture setup failed:",
      error
    );

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });