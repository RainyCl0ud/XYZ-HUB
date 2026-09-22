import {
  prisma,
} from "../lib/prisma.js";

import {
  canAccessModel,
  canAssignRole,
  hasPermission,
  type AccessContext,
} from "./access-control.js";

export type UpdatePersonAccessInput = {
  userId: string;
  roleIds: string[];
  modelIds: string[];
};

export type PeopleAccessUpdateErrorCode =
  | "PEOPLE_MANAGE_REQUIRED"
  | "USER_NOT_FOUND"
  | "ROLE_REQUIRED"
  | "INVALID_ROLE"
  | "ROLE_NOT_ASSIGNABLE"
  | "CURRENT_ROLE_NOT_MANAGEABLE"
  | "INVALID_MODEL"
  | "MODEL_NOT_ASSIGNABLE"
  | "CURRENT_MODEL_NOT_MANAGEABLE";

export class PeopleAccessUpdateError extends Error {
  readonly code:
    PeopleAccessUpdateErrorCode;

  constructor(
    code:
      PeopleAccessUpdateErrorCode,
    message:
      string
  ) {
    super(
      message
    );

    this.name =
      "PeopleAccessUpdateError";

    this.code =
      code;
  }
}

export async function updatePersonAccess(
  input:
    UpdatePersonAccessInput,
  access:
    AccessContext
) {
  if (
    !hasPermission(
      access,
      "people.manage"
    )
  ) {
    throw new PeopleAccessUpdateError(
      "PEOPLE_MANAGE_REQUIRED",
      "You do not have permission to manage people."
    );
  }

  const roleIds = [
    ...new Set(
      input.roleIds
    ),
  ];

  const modelIds = [
    ...new Set(
      input.modelIds
    ),
  ];

  if (
    roleIds.length ===
    0
  ) {
    throw new PeopleAccessUpdateError(
      "ROLE_REQUIRED",
      "At least one role must be assigned."
    );
  }

  /*
   * Load the target's existing assignments.
   *
   * This is important because an actor must
   * be allowed to manage what the target
   * CURRENTLY has, not merely what the actor
   * is trying to replace it with.
   */
  const target =
    await prisma.user.findUnique({
      where: {
        id:
          input.userId,
      },

      select: {
        id: true,
        name: true,
        email: true,
        status: true,

        roleMemberships: {
          select: {
            id: true,
            roleId: true,

            role: {
              select: {
                id: true,
                name: true,
                systemKey: true,
                rank: true,
              },
            },
          },
        },

        modelAssignments: {
          select: {
            id: true,
            modelId: true,

            model: {
              select: {
                id: true,
                name: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

  if (!target) {
    throw new PeopleAccessUpdateError(
      "USER_NOT_FOUND",
      "The user does not exist."
    );
  }

  /*
   * =======================================================
   * CURRENT ROLE AUTHORIZATION
   * =======================================================
   *
   * Prevents a Manager from taking somebody
   * they could never assign/manage and simply
   * stripping the protected role.
   */
  for (
    const membership
    of target.roleMemberships
  ) {
    if (
      !canAssignRole(
        access,
        membership.role
      )
    ) {
      throw new PeopleAccessUpdateError(
        "CURRENT_ROLE_NOT_MANAGEABLE",
        `You are not allowed to manage the current role "${membership.role.name}".`
      );
    }
  }

  /*
   * =======================================================
   * CURRENT MODEL AUTHORIZATION
   * =======================================================
   */
  for (
    const assignment
    of target.modelAssignments
  ) {
    if (
      !canAccessModel(
        access,
        assignment.modelId
      )
    ) {
      throw new PeopleAccessUpdateError(
        "CURRENT_MODEL_NOT_MANAGEABLE",
        `You are not allowed to manage the current model "${assignment.model.name}".`
      );
    }
  }

  /*
   * =======================================================
   * REQUESTED ROLE VALIDATION
   * =======================================================
   */
  const roles =
    await prisma.role.findMany({
      where: {
        id: {
          in:
            roleIds,
        },
      },

      select: {
        id: true,
        name: true,
        systemKey: true,
        rank: true,
      },
    });

  if (
    roles.length !==
    roleIds.length
  ) {
    throw new PeopleAccessUpdateError(
      "INVALID_ROLE",
      "One or more selected roles do not exist."
    );
  }

  for (
    const role
    of roles
  ) {
    if (
      !canAssignRole(
        access,
        role
      )
    ) {
      throw new PeopleAccessUpdateError(
        "ROLE_NOT_ASSIGNABLE",
        `You are not allowed to assign the role "${role.name}".`
      );
    }
  }

  /*
   * =======================================================
   * REQUESTED MODEL VALIDATION
   * =======================================================
   */
  const models =
    modelIds.length ===
    0
      ? []
      : await prisma
          .agencyModel
          .findMany({
            where: {
              id: {
                in:
                  modelIds,
              },
            },

            select: {
              id: true,
              name: true,
              isActive: true,
            },
          });

  if (
    models.length !==
    modelIds.length
  ) {
    throw new PeopleAccessUpdateError(
      "INVALID_MODEL",
      "One or more selected models do not exist."
    );
  }

  for (
    const model
    of models
  ) {
    if (
      !model.isActive
    ) {
      throw new PeopleAccessUpdateError(
        "INVALID_MODEL",
        `The model "${model.name}" is inactive and cannot be assigned.`
      );
    }

    if (
      !canAccessModel(
        access,
        model.id
      )
    ) {
      throw new PeopleAccessUpdateError(
        "MODEL_NOT_ASSIGNABLE",
        `You do not have access to assign the model "${model.name}".`
      );
    }
  }

  const currentRoleIds =
    new Set(
      target.roleMemberships.map(
        (membership) =>
          membership.roleId
      )
    );

  const requestedRoleIds =
    new Set(
      roleIds
    );

  const currentModelIds =
    new Set(
      target.modelAssignments.map(
        (assignment) =>
          assignment.modelId
      )
    );

  const requestedModelIds =
    new Set(
      modelIds
    );

  const roleIdsToAdd =
    roleIds.filter(
      (roleId) =>
        !currentRoleIds.has(
          roleId
        )
    );

  const roleIdsToRemove =
    [...currentRoleIds]
      .filter(
        (roleId) =>
          !requestedRoleIds.has(
            roleId
          )
      );

  const modelIdsToAdd =
    modelIds.filter(
      (modelId) =>
        !currentModelIds.has(
          modelId
        )
    );

  const modelIdsToRemove =
    [...currentModelIds]
      .filter(
        (modelId) =>
          !requestedModelIds.has(
            modelId
          )
      );

  /*
   * Only changed assignments are deleted or
   * created.
   *
   * Unchanged assignment rows keep their
   * original assignedAt / assignedBy metadata.
   */
  await prisma.$transaction(
    async (
      tx
    ) => {
      if (
        roleIdsToRemove.length >
        0
      ) {
        await tx.userRole.deleteMany({
          where: {
            userId:
              target.id,

            roleId: {
              in:
                roleIdsToRemove,
            },
          },
        });
      }

      if (
        roleIdsToAdd.length >
        0
      ) {
        await tx.userRole.createMany({
          data:
            roleIdsToAdd.map(
              (roleId) => ({
                userId:
                  target.id,

                roleId,

                assignedByUserId:
                  access.userId,
              })
            ),
        });
      }

      if (
        modelIdsToRemove.length >
        0
      ) {
        await tx
          .userModelAssignment
          .deleteMany({
            where: {
              userId:
                target.id,

              modelId: {
                in:
                  modelIdsToRemove,
              },
            },
          });
      }

      if (
        modelIdsToAdd.length >
        0
      ) {
        await tx
          .userModelAssignment
          .createMany({
            data:
              modelIdsToAdd.map(
                (modelId) => ({
                  userId:
                    target.id,

                  modelId,

                  assignedByUserId:
                    access.userId,
                })
              ),
          });
      }
    }
  );

  const updated =
    await prisma.user.findUniqueOrThrow({
      where: {
        id:
          target.id,
      },

      select: {
        id: true,
        name: true,
        email: true,
        status: true,

        roleMemberships: {
          select: {
            assignedAt: true,
            assignedByUserId: true,

            role: {
              select: {
                id: true,
                name: true,
                systemKey: true,
                rank: true,
                dataScope: true,
              },
            },
          },
        },

        modelAssignments: {
          select: {
            assignedAt: true,
            assignedByUserId: true,

            model: {
              select: {
                id: true,
                name: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

  return {
    id:
      updated.id,

    name:
      updated.name,

    email:
      updated.email,

    status:
      updated.status,

    roles:
      updated.roleMemberships.map(
        (membership) => ({
          ...membership.role,

          assignedAt:
            membership.assignedAt,

          assignedByUserId:
            membership.assignedByUserId,
        })
      ),

    models:
      updated.modelAssignments.map(
        (assignment) => ({
          ...assignment.model,

          assignedAt:
            assignment.assignedAt,

          assignedByUserId:
            assignment.assignedByUserId,
        })
      ),
  };
}