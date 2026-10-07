import type {
  Prisma,
} from "@prisma/client";

import {
  prisma,
} from "../lib/prisma.js";

import {
  hasPermission,
  type AccessContext,
} from "./access-control.js";

export const MODEL_CONTEXT_HEADER =
  "x-xyz-model-id";

export type QaModelScope = {
  selectedModelId:
    string | null;

  modelIds:
    string[];

  seesAllModels:
    boolean;
};

export type AccessibleQaModel = {
  id: string;
  name: string;
  isActive: boolean;
};

export class QaAccessError extends Error {
  code:
    | "QA_ACCESS_REQUIRED"
    | "QA_CONFIGURATION_REQUIRED"
    | "MODEL_NOT_ACCESSIBLE"
    | "MODEL_NOT_FOUND"
    | "MODEL_INACTIVE"
    | "MODEL_CONTEXT_REQUIRED"
    | "CHATTER_MODEL_MISMATCH";

  constructor(
    code:
      QaAccessError["code"],
    message:
      string
  ) {
    super(
      message
    );

    this.name =
      "QaAccessError";

    this.code =
      code;
  }
}

/*
 * QA authorization is now permission-driven.
 */
export function canViewQa(
  access:
    AccessContext
) {
  return hasPermission(
    access,
    "quality.access"
  );
}


export function canConfigureQa(
  access:
    AccessContext
) {
  return hasPermission(
    access,
    "quality.rules.manage"
  );
}


export function canManageQaIncidents(
  access:
    AccessContext
) {
  return (
    hasPermission(
      access,
      "quality.incidents.create"
    ) ||
    hasPermission(
      access,
      "quality.incidents.resolve"
    ) ||
    hasPermission(
      access,
      "quality.incidents.void"
    )
  );
}


export function requireQaAccess(
  access:
    AccessContext
) {
  if (
    !canViewQa(
      access
    )
  ) {
    throw new QaAccessError(
      "QA_ACCESS_REQUIRED",
      "You do not have access to the QA workspace."
    );
  }
}

export function requireQaConfiguration(
  access:
    AccessContext
) {
  if (
    !canConfigureQa(
      access
    )
  ) {
    throw new QaAccessError(
      "QA_CONFIGURATION_REQUIRED",
      "You do not have permission to change QA configuration."
    );
  }
}

export async function listAccessibleQaModels(
  access:
    AccessContext
): Promise<
  AccessibleQaModel[]
> {
  requireQaAccess(
    access
  );

  return prisma.agencyModel.findMany({
    where:
      access.canSeeAllModels
        ? undefined
        : {
            id: {
              in:
                access.assignedModelIds,
            },
          },

    select: {
      id:
        true,
      name:
        true,
      isActive:
        true,
    },

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
}

export async function resolveQaModelScope(
  access:
    AccessContext,
  requestedModelId:
    string | null
): Promise<QaModelScope> {
  requireQaAccess(
    access
  );

  const models =
    await listAccessibleQaModels(
      access
    );

  const accessibleIds =
    new Set(
      models.map(
        (
          model
        ) =>
          model.id
      )
    );

  if (
    requestedModelId &&
    !accessibleIds.has(
      requestedModelId
    )
  ) {
    throw new QaAccessError(
      "MODEL_NOT_ACCESSIBLE",
      "You do not have access to the selected creator."
    );
  }

  if (
    requestedModelId
  ) {
    return {
      selectedModelId:
        requestedModelId,

      modelIds: [
        requestedModelId,
      ],

      seesAllModels:
        false,
    };
  }

  if (
    access.canSeeAllModels
  ) {
    return {
      selectedModelId:
        null,

      modelIds:
        models.map(
          (
            model
          ) =>
            model.id
        ),

      seesAllModels:
        true,
    };
  }

  return {
    selectedModelId:
      null,

    modelIds:
      models.map(
        (
          model
        ) =>
          model.id
      ),

    seesAllModels:
      false,
  };
}

export function buildIncidentModelWhere(
  scope:
    QaModelScope
): Prisma.IncidentWhereInput {
  if (
    scope.seesAllModels
  ) {
    return {};
  }

  return {
    modelId: {
      in:
        scope.modelIds,
    },
  };
}

export function buildChatterModelWhere(
  scope:
    QaModelScope
): Prisma.ChatterWhereInput {
  if (
    scope.seesAllModels
  ) {
    return {};
  }

  return {
    OR: [
      {
        user: {
          modelAssignments: {
            some: {
              modelId: {
                in:
                  scope.modelIds,
              },
            },
          },
        },
      },
      {
        /*
         * Transitional support for legacy QA
         * chatter records that are not linked
         * to a Login Gate user yet. If they have
         * model-tagged incident history inside the
         * viewer's scope, they remain reviewable.
         */
        incidents: {
          some: {
            modelId: {
              in:
                scope.modelIds,
            },
          },
        },
      },
    ],
  };
}

export function readRequestedModelId(
  headerValue:
    string |
    string[] |
    undefined
) {
  const value =
    Array.isArray(
      headerValue
    )
      ? headerValue[0]
      : headerValue;

  if (
    !value
  ) {
    return null;
  }

  const trimmed =
    value.trim();

  if (
    !trimmed ||
    trimmed === "ALL"
  ) {
    return null;
  }

  return trimmed;
}

export async function resolveIncidentCreationModel(
  access:
    AccessContext,
  chatterId:
    string,
  requestedModelId:
    string | null
) {
  const scope =
    await resolveQaModelScope(
      access,
      requestedModelId
    );

  const chatter =
    await prisma.chatter.findUnique({
      where: {
        id:
          chatterId,
      },

      select: {
        id:
          true,
        status:
          true,
        userId:
          true,

        user: {
          select: {
            modelAssignments: {
              select: {
                model: {
                  select: {
                    id:
                      true,
                    name:
                      true,
                    isActive:
                      true,
                  },
                },
              },
            },
          },
        },
      },
    });

  if (
    !chatter
  ) {
    return null;
  }

  if (
    chatter.status !==
    "ACTIVE"
  ) {
    return {
      chatter,
      error:
        "Selected chatter is inactive",
      model:
        null,
    };
  }

  const assignedModels =
    chatter.user
      ?.modelAssignments
      .map(
        (
          assignment
        ) =>
          assignment.model
      ) ?? [];

  if (
    requestedModelId
  ) {
    const selectedModel =
      await prisma.agencyModel.findUnique({
        where: {
          id:
            requestedModelId,
        },

        select: {
          id:
            true,
          name:
            true,
          isActive:
            true,
        },
      });

    if (
      !selectedModel
    ) {
      throw new QaAccessError(
        "MODEL_NOT_FOUND",
        "The selected creator no longer exists."
      );
    }

    if (
      !selectedModel.isActive
    ) {
      throw new QaAccessError(
        "MODEL_INACTIVE",
        "New incidents cannot be logged against an inactive creator."
      );
    }

    if (
      chatter.userId &&
      !assignedModels.some(
        (
          model
        ) =>
          model.id ===
          requestedModelId
      )
    ) {
      throw new QaAccessError(
        "CHATTER_MODEL_MISMATCH",
        "The selected chatter is not assigned to the selected creator."
      );
    }

    return {
      chatter,
      error:
        null,
      model:
        selectedModel,
    };
  }

  const scopeIds =
    new Set(
      scope.modelIds
    );

  const candidates =
    assignedModels.filter(
      (
        model
      ) =>
        model.isActive &&
        (
          scope.seesAllModels ||
          scopeIds.has(
            model.id
          )
        )
    );

  if (
    candidates.length ===
    1
  ) {
    return {
      chatter,
      error:
        null,
      model:
        candidates[0],
    };
  }

  if (
    candidates.length ===
    0
  ) {
    throw new QaAccessError(
      "MODEL_CONTEXT_REQUIRED",
      chatter.userId
        ? "This chatter does not have an active creator assignment available in your current access scope."
        : "Select a creator before logging an incident for this legacy chatter record."
    );
  }

  throw new QaAccessError(
    "MODEL_CONTEXT_REQUIRED",
    "Select a creator before logging an incident for a chatter assigned to multiple creators."
  );
}
