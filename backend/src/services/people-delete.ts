import {
  prisma,
} from "../lib/prisma.js";

import {
  isOwner,
  type AccessContext,
} from "./access-control.js";

import {
  publishLiveUpdate,
} from "./live-updates.js";

export type DeletePersonInput = {
  userId: string;
  confirmEmail: string;
};

export type PeopleDeleteErrorCode =
  | "OWNER_REQUIRED"
  | "CANNOT_DELETE_SELF"
  | "USER_NOT_FOUND"
  | "CONFIRMATION_MISMATCH";

export class PeopleDeleteError extends Error {
  readonly code:
    PeopleDeleteErrorCode;

  constructor(
    code:
      PeopleDeleteErrorCode,
    message:
      string
  ) {
    super(message);

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
    !isOwner(
      access
    )
  ) {
    throw new PeopleDeleteError(
      "OWNER_REQUIRED",
      "Only an Owner may permanently delete a user."
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
    type: "session.invalidated",
    userId: user.id,
    reason: "ACCOUNT_DELETED",
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
