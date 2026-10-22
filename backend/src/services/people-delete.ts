import {
  prisma,
} from "../lib/prisma.js";

import {
  canAccessModel,
  canManageRoleTarget,
  hasPermission,
  type AccessContext,
} from "./access-control.js";

import {
  canAccessTeamGroup,
} from "./team-hierarchy.js";

import {
  publishLiveUpdate,
} from "./live-updates.js";
import { isCreatorChatEnabled } from "./creator-chat.js";
import { archiveUserStandingChats } from "./standing-chat.js";


export type DeletePersonInput = {
  userId: string;
  confirmEmail: string;
};


export type PeopleDeleteErrorCode =
  | "PEOPLE_DELETE_REQUIRED"
  | "CANNOT_DELETE_SELF"
  | "USER_NOT_FOUND"
  | "CONFIRMATION_MISMATCH"
  | "ROLE_NOT_MANAGEABLE"
  | "MODEL_NOT_MANAGEABLE"
  | "TEAM_GROUP_NOT_MANAGEABLE";


export class PeopleDeleteError
  extends Error {
  readonly code:
    PeopleDeleteErrorCode;

  constructor(
    code:
      PeopleDeleteErrorCode,
    message:
      string
  ) {
    super(
      message
    );

    this.name =
      "PeopleDeleteError";

    this.code =
      code;
  }
}


export async function deletePerson(
  input:
    DeletePersonInput,
  access:
    AccessContext
) {
  if (
    !hasPermission(
      access,
      "people.delete"
    )
  ) {
    throw new PeopleDeleteError(
      "PEOPLE_DELETE_REQUIRED",
      "You do not have permission to permanently delete employees."
    );
  }

  if (
    input.userId ===
    access.userId
  ) {
    throw new PeopleDeleteError(
      "CANNOT_DELETE_SELF",
      "You cannot permanently delete your own account."
    );
  }

  const user =
    await prisma.user.findUnique({
      where: {
        id:
          input.userId,
      },

      select: {
        id:
          true,

        name:
          true,

        email:
          true,

        status:
          true,

        teamGroupId:
          true,

        roleMemberships: {
          select: {
            role: {
              select: {
                systemKey:
                  true,

                rank:
                  true,
              },
            },
          },
        },

        modelAssignments: {
          select: {
            modelId:
              true,

            model: {
              select: {
                name:
                  true,
              },
            },
          },
        },

        chatterProfile: {
          select: {
            id:
              true,
          },
        },
      },
    });

  if (!user) {
    throw new PeopleDeleteError(
      "USER_NOT_FOUND",
      "The user does not exist."
    );
  }

  /*
   * Owner remains outside ordinary Employee Management.
   */
  if (
    user.roleMemberships.some(
      (
        membership
      ) =>
        membership.role
          .systemKey ===
        "OWNER"
    )
  ) {
    throw new PeopleDeleteError(
      "USER_NOT_FOUND",
      "The user does not exist."
    );
  }

  if (
    !await canAccessTeamGroup(
      access,
      user.teamGroupId
    )
  ) {
    throw new PeopleDeleteError(
      "TEAM_GROUP_NOT_MANAGEABLE",
      "You are not allowed to delete an employee outside your organization scope."
    );
  }

  for (
    const membership
    of user.roleMemberships
  ) {
    if (
      !canManageRoleTarget(
        access,
        membership.role
      )
    ) {
      throw new PeopleDeleteError(
        "ROLE_NOT_MANAGEABLE",
        "You are not allowed to delete an employee with a higher or protected role."
      );
    }
  }

  for (
    const assignment
    of user.modelAssignments
  ) {
    if (
      !canAccessModel(
        access,
        assignment.modelId
      )
    ) {
      throw new PeopleDeleteError(
        "MODEL_NOT_MANAGEABLE",
        `You are not allowed to manage the creator "${assignment.model.name}".`
      );
    }
  }

  const confirmation =
    input.confirmEmail
      .trim()
      .toLowerCase();

  if (
    confirmation !==
    user.email.toLowerCase()
  ) {
    throw new PeopleDeleteError(
      "CONFIRMATION_MISMATCH",
      "The confirmation email does not match the user being deleted."
    );
  }

  const chatterId =
    user.chatterProfile?.id ??
    null;

  const result =
    await prisma.$transaction(
      async (
        tx
      ) => {
        let deletedIncidents =
          0;

        if (
          chatterId
        ) {
          const incidentDelete =
            await tx.incident.deleteMany({
              where: {
                chatterId,
              },
            });

          deletedIncidents =
            incidentDelete.count;

          await tx.chatter.delete({
            where: {
              id:
                chatterId,
            },
          });
        }

        if (isCreatorChatEnabled()) await archiveUserStandingChats(tx, user.id);
        await tx.user.delete({
          where: {
            id:
              user.id,
          },
        });

        return {
          deletedIncidents,
        };
      }
    );

  publishLiveUpdate({
    type:
      "session.invalidated",

    userId:
      user.id,

    reason:
      "ACCOUNT_DELETED",
  });

  return {
    id:
      user.id,

    name:
      user.name,

    email:
      user.email,

    previousStatus:
      user.status,

    deletedChatterId:
      chatterId,

    deletedIncidentCount:
      result.deletedIncidents,
  };
}
