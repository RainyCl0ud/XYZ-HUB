import {
  prisma,
} from "../lib/prisma.js";

import {
  hasPermission,
  type AccessContext,
} from "./access-control.js";

export type StrikeReasonErrorCode =
  | "STRIKE_REASON_ACCESS_REQUIRED"
  | "STRIKES_CONFIGURE_REQUIRED"
  | "REASON_NOT_FOUND"
  | "REASON_NAME_IN_USE";

export class StrikeReasonError
  extends Error {
  readonly code:
    StrikeReasonErrorCode;

  constructor(
    code:
      StrikeReasonErrorCode,
    message:
      string
  ) {
    super(
      message
    );

    this.name =
      "StrikeReasonError";

    this.code =
      code;
  }
}

function normalizeName(
  value:
    string
) {
  return value
    .trim()
    .replace(
      /\s+/g,
      " "
    );
}

function normalizeDescription(
  value:
    string |
    null |
    undefined
) {
  const normalized =
    value
      ?.trim();

  return normalized
    ? normalized
    : null;
}

function assertReasonReadAccess(
  access:
    AccessContext
) {
  if (
    !hasPermission(
      access,
      "strikes.issue"
    ) &&
    !hasPermission(
      access,
      "strikes.configure"
    )
  ) {
    throw new StrikeReasonError(
      "STRIKE_REASON_ACCESS_REQUIRED",
      "You do not have permission to view Strike reasons."
    );
  }
}

function assertConfigureAccess(
  access:
    AccessContext
) {
  if (
    !hasPermission(
      access,
      "strikes.configure"
    )
  ) {
    throw new StrikeReasonError(
      "STRIKES_CONFIGURE_REQUIRED",
      "You do not have permission to configure Strikes."
    );
  }
}

async function assertUniqueReasonName(
  name:
    string,
  excludeId?:
    string
) {
  const duplicate =
    await prisma.strikeReason.findFirst({
      where: {
        ...(excludeId
          ? {
              id: {
                not:
                  excludeId,
              },
            }
          : {}),

        name: {
          equals:
            name,
          mode:
            "insensitive",
        },
      },

      select: {
        id:
          true,
      },
    });

  if (
    duplicate
  ) {
    throw new StrikeReasonError(
      "REASON_NAME_IN_USE",
      "Another Strike reason already uses this name."
    );
  }
}

export async function listActiveStrikeReasons(
  access:
    AccessContext
) {
  assertReasonReadAccess(
    access
  );

  return prisma.strikeReason.findMany({
    where: {
      isActive:
        true,
    },

    orderBy: [
      {
        sortOrder:
          "asc",
      },
      {
        name:
          "asc",
      },
    ],
  });
}

export async function listManagedStrikeReasons(
  access:
    AccessContext
) {
  assertConfigureAccess(
    access
  );

  return prisma.strikeReason.findMany({
    orderBy: [
      {
        isActive:
          "desc",
      },
      {
        sortOrder:
          "asc",
      },
      {
        name:
          "asc",
      },
    ],
  });
}

export async function createStrikeReason(
  input: {
    name:
      string;

    description?:
      string |
      null;

    sortOrder?:
      number;
  },
  access:
    AccessContext
) {
  assertConfigureAccess(
    access
  );

  const name =
    normalizeName(
      input.name
    );

  await assertUniqueReasonName(
    name
  );

  return prisma.strikeReason.create({
    data: {
      name,

      description:
        normalizeDescription(
          input.description
        ),

      sortOrder:
        input.sortOrder ??
        0,
    },
  });
}

export async function updateStrikeReason(
  reasonId:
    string,
  input: {
    name:
      string;

    description?:
      string |
      null;

    sortOrder:
      number;
  },
  access:
    AccessContext
) {
  assertConfigureAccess(
    access
  );

  const existing =
    await prisma.strikeReason.findUnique({
      where: {
        id:
          reasonId,
      },

      select: {
        id:
          true,
      },
    });

  if (
    !existing
  ) {
    throw new StrikeReasonError(
      "REASON_NOT_FOUND",
      "Strike reason not found."
    );
  }

  const name =
    normalizeName(
      input.name
    );

  await assertUniqueReasonName(
    name,
    reasonId
  );

  return prisma.strikeReason.update({
    where: {
      id:
        reasonId,
    },

    data: {
      name,

      description:
        normalizeDescription(
          input.description
        ),

      sortOrder:
        input.sortOrder,
    },
  });
}

export async function archiveStrikeReason(
  reasonId:
    string,
  access:
    AccessContext
) {
  assertConfigureAccess(
    access
  );

  const existing =
    await prisma.strikeReason.findUnique({
      where: {
        id:
          reasonId,
      },
    });

  if (
    !existing
  ) {
    throw new StrikeReasonError(
      "REASON_NOT_FOUND",
      "Strike reason not found."
    );
  }

  if (
    !existing.isActive
  ) {
    return existing;
  }

  return prisma.strikeReason.update({
    where: {
      id:
        reasonId,
    },

    data: {
      isActive:
        false,

      archivedAt:
        new Date(),
    },
  });
}

export async function reactivateStrikeReason(
  reasonId:
    string,
  access:
    AccessContext
) {
  assertConfigureAccess(
    access
  );

  const existing =
    await prisma.strikeReason.findUnique({
      where: {
        id:
          reasonId,
      },
    });

  if (
    !existing
  ) {
    throw new StrikeReasonError(
      "REASON_NOT_FOUND",
      "Strike reason not found."
    );
  }

  await assertUniqueReasonName(
    existing.name,
    existing.id
  );

  if (
    existing.isActive
  ) {
    return existing;
  }

  return prisma.strikeReason.update({
    where: {
      id:
        reasonId,
    },

    data: {
      isActive:
        true,

      archivedAt:
        null,
    },
  });
}