import {
  Prisma,
} from "@prisma/client";

import {
  prisma,
} from "../lib/prisma.js";

import {
  hasPermission,
  isOwner,
  type AccessContext,
} from "./access-control.js";

export type ModelManagementErrorCode =
  | "MODEL_MANAGEMENT_REQUIRED"
  | "MODEL_NOT_FOUND"
  | "MODEL_NAME_IN_USE"
  | "MODEL_ALREADY_ACTIVE"
  | "MODEL_ALREADY_INACTIVE";

export class ModelManagementError extends Error {
  readonly code:
    ModelManagementErrorCode;

  constructor(
    code:
      ModelManagementErrorCode,
    message:
      string
  ) {
    super(message);

    this.name =
      "ModelManagementError";

    this.code =
      code;
  }
}

export function canManageModelCatalog(
  access:
    AccessContext
): boolean {
  return hasPermission(
    access,
    "models.access"
  );
}


function assertCanManageModels(
  access:
    AccessContext,
  permissionKey:
    string
) {
  if (
    !hasPermission(
      access,
      permissionKey
    )
  ) {
    throw new ModelManagementError(
      "MODEL_MANAGEMENT_REQUIRED",
      "You do not have permission to perform this creator-management action."
    );
  }
}

const modelSummaryArgs =
  Prisma.validator<Prisma.AgencyModelDefaultArgs>()({
    select: {
      id: true,
      name: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,

      creatorUser: {
        select: {
          id: true, name: true, status: true,
          roleMemberships: {
            where: { role: { systemKey: "MODEL", archivedAt: null } },
            select: { id: true }, take: 1,
          },
        },
      },
      _count: {
        select: {
          assignments: true,
          incidents: true,
        },
      },
    },
  });

function formatModel(
  model:
    Prisma.AgencyModelGetPayload<
      typeof modelSummaryArgs
    >,
  access: AccessContext,
) {
  return {
    id:
      model.id,

    name:
      model.name,

    isActive:
      model.isActive,

    createdAt:
      model.createdAt,

    updatedAt:
      model.updatedAt,

    hasLinkedAccount: Boolean(model.creatorUser),
    creatorAccount: isOwner(access) && model.creatorUser ? {
      id: model.creatorUser.id,
      name: model.creatorUser.name,
      status: model.creatorUser.status,
      hasCreatorRole: model.creatorUser.roleMemberships.length > 0,
    } : null,
    peopleCount:
      model._count
        .assignments,

    incidentCount:
      model._count
        .incidents,
  };
}

export async function listManagedModels(
  access:
    AccessContext
) {
  assertCanManageModels(
    access,
    "models.access"
  );

  const models =
    await prisma.agencyModel.findMany({
      ...modelSummaryArgs,

      /*
       * Creator Management displays Created / Updated timestamps,
       * so the table follows the system-wide newest-first rule.
       */
      orderBy: [
        {
          updatedAt:
            "desc",
        },

        {
          createdAt:
            "desc",
        },

        {
          id:
            "desc",
        },
      ],
    });

  return models.map((model) => formatModel(model, access));
}

async function findNameConflict(
  name:
    string,
  excludeId?:
    string
) {
  return prisma.agencyModel.findFirst({
    where: {
      name: {
        equals:
          name,

        mode:
          "insensitive",
      },

      ...(excludeId
        ? {
            id: {
              not:
                excludeId,
            },
          }
        : {}),
    },

    select: {
      id: true,
    },
  });
}

export async function createManagedModel(
  name:
    string,
  access:
    AccessContext
) {
  assertCanManageModels(
    access,
    "models.create"
  );

  const normalizedName =
    name.trim();

  const conflict =
    await findNameConflict(
      normalizedName
    );

  if (conflict) {
    throw new ModelManagementError(
      "MODEL_NAME_IN_USE",
      "A creator with this name already exists."
    );
  }

  const created =
    await prisma.agencyModel.create({
      data: {
        name:
          normalizedName,
      },

      ...modelSummaryArgs,
    });

  return formatModel(
    created, access
  );
}

export async function renameManagedModel(
  modelId:
    string,
  name:
    string,
  access:
    AccessContext
) {
  assertCanManageModels(
    access,
    "models.edit"
  );

  const existing =
    await prisma.agencyModel.findUnique({
      where: {
        id:
          modelId,
      },

      select: {
        id: true,
      },
    });

  if (!existing) {
    throw new ModelManagementError(
      "MODEL_NOT_FOUND",
      "The creator does not exist."
    );
  }

  const normalizedName =
    name.trim();

  const conflict =
    await findNameConflict(
      normalizedName,
      modelId
    );

  if (conflict) {
    throw new ModelManagementError(
      "MODEL_NAME_IN_USE",
      "A creator with this name already exists."
    );
  }

  const updated =
    await prisma.agencyModel.update({
      where: {
        id:
          modelId,
      },

      data: {
        name:
          normalizedName,
      },

      ...modelSummaryArgs,
    });

  return formatModel(
    updated, access
  );
}

export async function deactivateManagedModel(
  modelId:
    string,
  access:
    AccessContext
) {
  assertCanManageModels(
    access,
    "models.status.manage"
  );

  const existing =
    await prisma.agencyModel.findUnique({
      where: {
        id:
          modelId,
      },

      select: {
        id: true,
        isActive: true,
      },
    });

  if (!existing) {
    throw new ModelManagementError(
      "MODEL_NOT_FOUND",
      "The creator does not exist."
    );
  }

  if (
    !existing.isActive
  ) {
    throw new ModelManagementError(
      "MODEL_ALREADY_INACTIVE",
      "The creator is already inactive."
    );
  }

  const updated =
    await prisma.agencyModel.update({
      where: {
        id:
          modelId,
      },

      data: {
        isActive:
          false,
      },

      ...modelSummaryArgs,
    });

  return formatModel(
    updated, access
  );
}

export async function reactivateManagedModel(
  modelId:
    string,
  access:
    AccessContext
) {
  assertCanManageModels(
    access,
    "models.status.manage"
  );

  const existing =
    await prisma.agencyModel.findUnique({
      where: {
        id:
          modelId,
      },

      select: {
        id: true,
        isActive: true,
      },
    });

  if (!existing) {
    throw new ModelManagementError(
      "MODEL_NOT_FOUND",
      "The creator does not exist."
    );
  }

  if (
    existing.isActive
  ) {
    throw new ModelManagementError(
      "MODEL_ALREADY_ACTIVE",
      "The creator is already active."
    );
  }

  const updated =
    await prisma.agencyModel.update({
      where: {
        id:
          modelId,
      },

      data: {
        isActive:
          true,
      },

      ...modelSummaryArgs,
    });

  return formatModel(
    updated, access
  );
}
