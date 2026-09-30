import {
  Prisma,
} from "@prisma/client";

import {
  prisma,
} from "../lib/prisma.js";

export type LinkLegacyChatterInput = {
  chatterName: string;
  userEmail: string;
};

export type LegacyChatterLinkErrorCode =
  | "USER_NOT_FOUND"
  | "USER_NOT_CHATTER"
  | "USER_ALREADY_LINKED"
  | "CHATTER_NOT_FOUND"
  | "CHATTER_AMBIGUOUS"
  | "LINK_CONFLICT";

export class LegacyChatterLinkError extends Error {
  readonly code:
    LegacyChatterLinkErrorCode;

  constructor(
    code:
      LegacyChatterLinkErrorCode,
    message:
      string
  ) {
    super(message);
    this.name =
      "LegacyChatterLinkError";
    this.code =
      code;
  }
}

export async function linkLegacyChatterToUser(
  input:
    LinkLegacyChatterInput
) {
  const chatterName =
    input.chatterName.trim();
  const userEmail =
    input.userEmail
      .trim()
      .toLowerCase();

  const user =
    await prisma.user.findFirst({
      where: {
        email: {
          equals:
            userEmail,
          mode:
            "insensitive",
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        chatterProfile: {
          select: {
            id: true,
            name: true,
          },
        },
        roleMemberships: {
          select: {
            role: {
              select: {
                systemKey: true,
              },
            },
          },
        },
      },
    });

  if (!user) {
    throw new LegacyChatterLinkError(
      "USER_NOT_FOUND",
      "No People account matches that email."
    );
  }

  const hasChatterRole =
    user.roleMemberships.some(
      (membership) =>
        membership.role
          .systemKey ===
        "CHATTER"
    );

  if (!hasChatterRole) {
    throw new LegacyChatterLinkError(
      "USER_NOT_CHATTER",
      "The selected People account does not currently have the Chatter role."
    );
  }

  if (user.chatterProfile) {
    throw new LegacyChatterLinkError(
      "USER_ALREADY_LINKED",
      `This People account is already linked to the QA chatter "${user.chatterProfile.name}".`
    );
  }

  const candidates =
    await prisma.chatter.findMany({
      where: {
        userId: null,
        name: {
          equals:
            chatterName,
          mode:
            "insensitive",
        },
      },
      select: {
        id: true,
        name: true,
        status: true,
      },
      take: 2,
    });

  if (
    candidates.length ===
    0
  ) {
    throw new LegacyChatterLinkError(
      "CHATTER_NOT_FOUND",
      "No unlinked QA chatter matches that name."
    );
  }

  if (
    candidates.length >
    1
  ) {
    throw new LegacyChatterLinkError(
      "CHATTER_AMBIGUOUS",
      "More than one unlinked QA chatter matches that name. Linkage was not changed."
    );
  }

  const chatter =
    candidates[0];

  try {
    const updated =
      await prisma.chatter.update({
        where: {
          id:
            chatter.id,
        },
        data: {
          userId:
            user.id,
          name:
            user.name,
        },
        select: {
          id: true,
          userId: true,
          name: true,
          status: true,
        },
      });

    return {
      chatter:
        updated,
      user: {
        id:
          user.id,
        name:
          user.name,
        email:
          user.email,
      },
    };
  } catch (error) {
    if (
      error instanceof
        Prisma.PrismaClientKnownRequestError &&
      error.code ===
        "P2002"
    ) {
      throw new LegacyChatterLinkError(
        "LINK_CONFLICT",
        "The People account or QA chatter became linked while this request was being processed. Refresh and review the current record."
      );
    }

    throw error;
  }
}
