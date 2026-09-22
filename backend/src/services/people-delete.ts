import {
  prisma,
} from "../lib/prisma.js";

import {
  hasPermission,
  isOwner,
  type AccessContext,
} from "./access-control.js";

export type DeletePersonInput = {
  userId: string;
  confirmEmail: string;
};

export type PeopleDeleteErrorCode =
  | "OWNER_REQUIRED"
  | "PEOPLE_DELETE_REQUIRED"
  | "USER_NOT_FOUND"
  | "CANNOT_DELETE_SELF"
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
    !hasPermission(
      access,
      "people.delete"
    )
  ) {
    throw new PeopleDeleteError(
      "PEOPLE_DELETE_REQUIRED",
      "You do not have permission to permanently delete users."
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
        id: true,
        name: true,
        email: true,
        status: true,

        chatterProfile: {
          select: {
            id: true,
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

  const preservedChatterId =
    user.chatterProfile?.id ??
    null;

  await prisma.$transaction(
    async (
      tx
    ) => {
      /*
       * Existing QA history belongs to the
       * Chatter record, not to Login Gate.
       *
       * Detach the Login Gate identity first
       * so historical QA/incidents remain.
       */
      if (
        preservedChatterId
      ) {
        await tx.chatter.update({
          where: {
            id:
              preservedChatterId,
          },

          data: {
            userId:
              null,
          },
        });
      }

      /*
       * Related authentication records,
       * memberships, invites, sessions,
       * password-reset records and 2FA
       * records cascade according to the
       * Prisma schema.
       *
       * Historical records where this user
       * was merely the assigner/creator use
       * SetNull and therefore remain.
       */
      await tx.user.delete({
        where: {
          id:
            user.id,
        },
      });
    }
  );

  return {
    id:
      user.id,

    name:
      user.name,

    email:
      user.email,

    previousStatus:
      user.status,

    preservedChatterId,
  };
}