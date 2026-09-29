import {
  Prisma,
  UserStatus,
} from "@prisma/client";

import {
  prisma,
} from "../lib/prisma.js";

import {
  canAccessModel,
  canAssignRole,
  hasPermission,
  type AccessContext,
} from "./access-control.js";

import {
  INVITE_TTL_MS,
} from "./invite.js";

import {
  getVisibleTeamGroupIds,
  ROOT_TEAM_GROUP_ID,
} from "./team-hierarchy.js";

import {
  generateInviteToken,
  hashInviteToken,
} from "./invite-token.js";

export type InvitePersonInput = {
  name: string;
  email: string;
  roleIds: string[];
  modelIds: string[];
  teamGroupId?: string | null;
};

export type InvitePersonResult = {
  user: {
    id: string;
    name: string;
    email: string;
    status: UserStatus;
  };

  invite: {
    id: string;
    expiresAt: Date;
  };

  /*
   * Raw token is returned only so the
   * delivery layer can build the invite link.
   *
   * It must never be stored directly.
   */
  token: string;
};

export type PeopleInviteErrorCode =
  | "PEOPLE_MANAGE_REQUIRED"
  | "ROLE_REQUIRED"
  | "INVALID_ROLE"
  | "ROLE_NOT_ASSIGNABLE"
  | "INVALID_MODEL"
  | "MODEL_NOT_ASSIGNABLE"
  | "INVALID_TEAM_GROUP"
  | "TEAM_GROUP_NOT_ASSIGNABLE"
  | "EMAIL_IN_USE";

export class PeopleInviteError extends Error {
  readonly code: PeopleInviteErrorCode;

  constructor(
    code: PeopleInviteErrorCode,
    message: string
  ) {
    super(message);

    this.name =
      "PeopleInviteError";

    this.code =
      code;
  }
}

/*
 * =========================================================
 * INVITE PERSON
 * =========================================================
 *
 * Creates:
 *
 * User
 * UserRole records
 * UserModelAssignment records
 * Invite
 *
 * as one database transaction.
 */
export async function invitePerson(
  input: InvitePersonInput,
  access: AccessContext
): Promise<InvitePersonResult> {
  /*
   * Authorization is checked here as well as
   * later at the HTTP middleware layer.
   *
   * Business services must not rely solely on
   * routes being configured correctly.
   */
  if (
    !hasPermission(
      access,
      "people.manage"
    )
  ) {
    throw new PeopleInviteError(
      "PEOPLE_MANAGE_REQUIRED",
      "You do not have permission to invite people."
    );
  }

  const name =
    input.name.trim();

  const email =
    input.email
      .trim()
      .toLowerCase();

  /*
   * Remove duplicate IDs before validating
   * or writing them.
   */
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
    roleIds.length === 0
  ) {
    throw new PeopleInviteError(
      "ROLE_REQUIRED",
      "At least one role must be assigned."
    );
  }

  /*
   * =======================================================
   * EMAIL UNIQUENESS
   * =======================================================
   */

  const existingUser =
    await prisma.user.findFirst({
      where: {
        email: {
          equals:
            email,

          mode:
            "insensitive",
        },
      },

      select: {
        id: true,
      },
    });

  if (existingUser) {
    throw new PeopleInviteError(
      "EMAIL_IN_USE",
      "A user with this email already exists."
    );
  }

  /*
   * =======================================================
   * ROLE VALIDATION
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
    throw new PeopleInviteError(
      "INVALID_ROLE",
      "One or more selected roles do not exist."
    );
  }

  for (
    const role of roles
  ) {
    if (
      !canAssignRole(
        access,
        role
      )
    ) {
      throw new PeopleInviteError(
        "ROLE_NOT_ASSIGNABLE",
        `You are not allowed to assign the role "${role.name}".`
      );
    }
  }

  /*
   * =======================================================
   * MODEL VALIDATION
   * =======================================================
   */

  const models =
    modelIds.length === 0
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
    throw new PeopleInviteError(
      "INVALID_MODEL",
      "One or more selected creators do not exist."
    );
  }

  for (
    const model of models
  ) {
    if (!model.isActive) {
      throw new PeopleInviteError(
        "INVALID_MODEL",
        `The creator "${model.name}" is inactive and cannot be assigned.`
      );
    }

    if (
      !canAccessModel(
        access,
        model.id
      )
    ) {
      throw new PeopleInviteError(
        "MODEL_NOT_ASSIGNABLE",
        `You do not have access to assign the creator "${model.name}".`
      );
    }
  }

  /*
   * =======================================================
   * TEAM GROUP VALIDATION
   * =======================================================
   *
   * If no group is chosen, managers default to their own
   * group. Owner/legacy callers fall back to the permanent
   * XYZ Management root.
   */
  const teamGroupId =
    input.teamGroupId
      ?.trim() ||
    access.teamGroupId ||
    ROOT_TEAM_GROUP_ID;

  const [
    teamGroup,
    visibleTeamGroupIds,
  ] =
    await Promise.all([
      prisma.teamGroup.findUnique({
        where: {
          id:
            teamGroupId,
        },

        select: {
          id:
            true,
          name:
            true,
        },
      }),

      getVisibleTeamGroupIds(
        access
      ),
    ]);

  if (
    !teamGroup
  ) {
    throw new PeopleInviteError(
      "INVALID_TEAM_GROUP",
      "The selected team group does not exist."
    );
  }

  if (
    !visibleTeamGroupIds.has(
      teamGroup.id
    )
  ) {
    throw new PeopleInviteError(
      "TEAM_GROUP_NOT_ASSIGNABLE",
      "You are not allowed to assign a person to the selected team group."
    );
  }

  /*
   * =======================================================
   * INVITE TOKEN
   * =======================================================
   */

  const token =
    generateInviteToken();

  const tokenHash =
    hashInviteToken(
      token
    );

  const now =
    new Date();

  const expiresAt =
    new Date(
      now.getTime() +
        INVITE_TTL_MS
    );

  try {
    const result =
      await prisma.$transaction(
        async (tx) => {
          /*
           * Re-check the email inside the transaction.
           *
           * Every management-created email is stored
           * normalized to lowercase.
           */
          const duplicate =
            await tx.user.findFirst({
              where: {
                email: {
                  equals:
                    email,

                  mode:
                    "insensitive",
                },
              },

              select: {
                id: true,
              },
            });

          if (duplicate) {
            throw new PeopleInviteError(
              "EMAIL_IN_USE",
              "A user with this email already exists."
            );
          }

          /*
           * New invited users do not receive a
           * password here.
           *
           * They remain PENDING_SETUP until they
           * accept the invitation and create their
           * own password.
           */
          const user =
            await tx.user.create({
              data: {
                name,

                email,

                passwordHash:
                  null,

                status:
                  UserStatus.PENDING_SETUP,

                teamGroupId:
                  teamGroup.id,
              },
            });

          /*
           * Roles stack, so every selected role is
           * recorded independently.
           */
          await tx.userRole.createMany({
            data:
              roleIds.map(
                (roleId) => ({
                  userId:
                    user.id,

                  roleId,

                  assignedByUserId:
                    access.userId,
                })
              ),
          });

          if (
            modelIds.length > 0
          ) {
            await tx.userModelAssignment.createMany({
              data:
                modelIds.map(
                  (modelId) => ({
                    userId:
                      user.id,

                    modelId,

                    assignedByUserId:
                      access.userId,
                  })
                ),
            });
          }

          const invite =
            await tx.invite.create({
              data: {
                userId:
                  user.id,

                tokenHash,

                createdByUserId:
                  access.userId,

                sentAt:
                  now,

                expiresAt,
              },
            });

          return {
            user,
            invite,
          };
        }
      );

    return {
      user: {
        id:
          result.user.id,

        name:
          result.user.name,

        email:
          result.user.email,

        status:
          result.user.status,
      },

      invite: {
        id:
          result.invite.id,

        expiresAt:
          result.invite.expiresAt,
      },

      token,
    };
  } catch (error) {
    if (
      error instanceof
      PeopleInviteError
    ) {
      throw error;
    }

    /*
     * Because all management-created emails
     * are normalized to lowercase, the DB
     * unique constraint also protects against
     * concurrent duplicate creation.
     */
    if (
      error instanceof
        Prisma.PrismaClientKnownRequestError &&
      error.code ===
        "P2002"
    ) {
      throw new PeopleInviteError(
        "EMAIL_IN_USE",
        "A user with this email already exists."
      );
    }

    throw error;
  }
}