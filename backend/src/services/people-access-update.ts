import {
  prisma,
} from "../lib/prisma.js";

import {
  canAccessModel,
  canAssignRole,
  hasPermission,
  isOwner,
  type AccessContext,
} from "./access-control.js";

import {
  getVisibleTeamGroupIds,
} from "./team-hierarchy.js";

export type UpdatePersonAccessInput = {
  userId: string;
  roleIds: string[];
  modelIds: string[];
  teamGroupId?: string;
};

export type PeopleAccessUpdateErrorCode =
  | "PEOPLE_MANAGE_REQUIRED"
  | "USER_NOT_FOUND"
  | "CANNOT_UPDATE_SELF_ACCESS"
  | "ROLE_REQUIRED"
  | "INVALID_ROLE"
  | "ROLE_NOT_ASSIGNABLE"
  | "CURRENT_ROLE_NOT_MANAGEABLE"
  | "INVALID_MODEL"
  | "MODEL_NOT_ASSIGNABLE"
  | "CURRENT_MODEL_NOT_MANAGEABLE"
  | "INVALID_TEAM_GROUP"
  | "TEAM_GROUP_NOT_ASSIGNABLE"
  | "CURRENT_TEAM_GROUP_NOT_MANAGEABLE";

export class PeopleAccessUpdateError extends Error {
  readonly code:
    PeopleAccessUpdateErrorCode;

  constructor(
    code:
      PeopleAccessUpdateErrorCode,
    message:
      string
  ) {
    super(message);
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
      "people.assign_roles"
    )
  ) {
    throw new PeopleAccessUpdateError(
      "PEOPLE_MANAGE_REQUIRED",
      "You do not have permission to manage people."
    );
  }

  if (
    input.userId ===
    access.userId
  ) {
    throw new PeopleAccessUpdateError(
      "CANNOT_UPDATE_SELF_ACCESS",
      "You cannot change your own role or creator assignments."
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
        teamGroupId: true,
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

  /* Existing Owners remain outside ordinary People Management. */
  if (
    target.roleMemberships.some(
      (membership) =>
        membership.role.systemKey ===
        "OWNER"
    )
  ) {
    throw new PeopleAccessUpdateError(
      "USER_NOT_FOUND",
      "The user does not exist."
    );
  }

  const visibleTeamGroupIds =
    await getVisibleTeamGroupIds(
      access
    );

  if (
    target.teamGroupId
  ) {
    if (
      !visibleTeamGroupIds.has(
        target.teamGroupId
      )
    ) {
      throw new PeopleAccessUpdateError(
        "CURRENT_TEAM_GROUP_NOT_MANAGEABLE",
        "You are not allowed to manage a person outside your organization scope."
      );
    }
  } else if (
    !isOwner(
      access
    )
  ) {
    throw new PeopleAccessUpdateError(
      "CURRENT_TEAM_GROUP_NOT_MANAGEABLE",
      "You are not allowed to manage an ungrouped person."
    );
  }

  let requestedTeamGroup:
    {
      id: string;
      name: string;
    } |
    null =
      null;

  if (
    input.teamGroupId !==
    undefined
  ) {
    const teamGroupId =
      input.teamGroupId.trim();

    if (!teamGroupId) {
      throw new PeopleAccessUpdateError(
        "INVALID_TEAM_GROUP",
        "The selected team group is invalid."
      );
    }

    requestedTeamGroup =
      await prisma.teamGroup.findUnique({
        where: {
          id:
            teamGroupId,
        },
        select: {
          id: true,
          name: true,
        },
      });

    if (!requestedTeamGroup) {
      throw new PeopleAccessUpdateError(
        "INVALID_TEAM_GROUP",
        "The selected team group does not exist."
      );
    }

    if (
      !visibleTeamGroupIds.has(
        requestedTeamGroup.id
      )
    ) {
      throw new PeopleAccessUpdateError(
        "TEAM_GROUP_NOT_ASSIGNABLE",
        "You are not allowed to move a person to the selected team group."
      );
    }
  }

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
        `You are not allowed to manage the current creator "${assignment.model.name}".`
      );
    }
  }

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

  /*
   * Owner assignment is intentionally permitted only through
   * canAssignRole(), which reserves the protected role set for Owners.
   * Once promoted, the target is hidden/protected by the existing Owner
   * read and mutation boundaries.
   */
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

  const models =
    modelIds.length ===
      0
      ? []
      : await prisma.agencyModel.findMany({
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
      "One or more selected creators do not exist."
    );
  }

  for (
    const model
    of models
  ) {
    const alreadyAssigned =
      target.modelAssignments.some(
        (assignment) =>
          assignment.modelId ===
          model.id
      );

    if (
      !model.isActive &&
      !alreadyAssigned
    ) {
      throw new PeopleAccessUpdateError(
        "INVALID_MODEL",
        `The creator "${model.name}" is inactive and cannot be newly assigned.`
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
        `You do not have access to assign the creator "${model.name}".`
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
    [...currentRoleIds].filter(
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
    [...currentModelIds].filter(
      (modelId) =>
        !requestedModelIds.has(
          modelId
        )
    );

  /*
   * Team hierarchy changes remain Owner-only.
   *
   * Role and creator assignment are permitted for authorized users,
   * with role rank and creator visibility enforced above.
   */
  const teamChanged =
    Boolean(
      requestedTeamGroup &&
      requestedTeamGroup.id !==
        target.teamGroupId
    );

  if (
    !isOwner(
      access
    ) &&
    teamChanged
  ) {
    throw new PeopleAccessUpdateError(
      "TEAM_GROUP_NOT_ASSIGNABLE",
      "Only Owners may change team assignments through this endpoint."
    );
  }

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
        await tx.userModelAssignment.deleteMany({
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
        await tx.userModelAssignment.createMany({
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

      if (
        requestedTeamGroup &&
        requestedTeamGroup.id !==
          target.teamGroupId
      ) {
        await tx.user.update({
          where: {
            id:
              target.id,
          },
          data: {
            teamGroupId:
              requestedTeamGroup.id,
          },
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
        teamGroup: {
          select: {
            id: true,
            name: true,
            parentId: true,
            isRoot: true,
          },
        },
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
    teamGroup:
      updated.teamGroup,
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
