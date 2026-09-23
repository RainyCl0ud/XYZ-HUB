import {
  Prisma,
} from "@prisma/client";

import {
  prisma,
} from "../lib/prisma.js";

import {
  hasPermission,
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
  const hasManagementRole =
    access.roles.some(
      (
        role
      ) =>
        role.systemKey ===
          "OWNER" ||
        role.systemKey ===
          "OPS_MANAGER"
    );

  return (
    hasManagementRole &&
    hasPermission(
      access,
      "people.manage"
    )
  );
}

function assertCanManageModels(
  access:
    AccessContext
) {
  if (
    !canManageModelCatalog(
      access
    )
  ) {
    throw new ModelManagementError(
      "MODEL_MANAGEMENT_REQUIRED",
      "Only an Owner or Ops Manager may manage the model catalog."
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
    >
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
    access
  );

  const models =
    await prisma.agencyModel.findMany({
      ...modelSummaryArgs,

      orderBy: [
        {
          isActive:
            "desc",
        },

        {
          name:
            "asc",
        },
      ],
    });

  return models.map(
    formatModel
  );
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
    access
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
      "A model with this name already exists."
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
    created
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
    access
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
      "The model does not exist."
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
      "A model with this name already exists."
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
    updated
  );
}

export async function deactivateManagedModel(
  modelId:
    string,
  access:
    AccessContext
) {
  assertCanManageModels(
    access
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
      "The model does not exist."
    );
  }

  if (
    !existing.isActive
  ) {
    throw new ModelManagementError(
      "MODEL_ALREADY_INACTIVE",
      "The model is already inactive."
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
    updated
  );
}

export async function reactivateManagedModel(
  modelId:
    string,
  access:
    AccessContext
) {
  assertCanManageModels(
    access
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
      "The model does not exist."
    );
  }

  if (
    existing.isActive
  ) {
    throw new ModelManagementError(
      "MODEL_ALREADY_ACTIVE",
      "The model is already active."
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
    updated
  );
}
