import {
  Prisma,
  TwoFactorMethodType,
  UserStatus,
} from "@prisma/client";

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

export type PeopleReadErrorCode =
  | "PEOPLE_MANAGE_REQUIRED"
  | "USER_NOT_FOUND"
  | "PERSON_NOT_VISIBLE";

export class PeopleReadError extends Error {
  readonly code:
    PeopleReadErrorCode;

  constructor(
    code:
      PeopleReadErrorCode,
    message:
      string
  ) {
    super(message);

    this.name =
      "PeopleReadError";

    this.code =
      code;
  }
}

const personReadArgs =
  Prisma.validator<Prisma.UserDefaultArgs>()({
    select: {
      id: true,
      name: true,
      email: true,
      status: true,

      createdAt: true,
      emailVerifiedAt: true,
      deactivatedAt: true,
      lastSignInAt: true,

      teamGroup: {
        select: {
          id: true,
          name: true,
          parentId: true,
          isRoot: true,
        },
      },

      roleMemberships: {
        orderBy: {
          assignedAt:
            "asc",
        },

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
        orderBy: {
          assignedAt:
            "asc",
        },

        select: {
          modelId: true,
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

      twoFactorMethods: {
        select: {
          type: true,
          isEnabled: true,
          verifiedAt: true,
        },
      },

      invites: {
        orderBy: {
          createdAt:
            "desc",
        },

        take: 1,

        select: {
          id: true,
          sentAt: true,
          expiresAt: true,
          acceptedAt: true,
          revokedAt: true,
        },
      },
    },
  });

type PersonReadRecord =
  Prisma.UserGetPayload<
    typeof personReadArgs
  >;

function isOpsManager(
  access:
    AccessContext
): boolean {
  return access.roles.some(
    (role) =>
      role.systemKey ===
      "OPS_MANAGER"
  );
}

function assertPeopleReadAccess(
  access:
    AccessContext
) {
  if (
    !hasPermission(
      access,
      "people.manage"
    )
  ) {
    throw new PeopleReadError(
      "PEOPLE_MANAGE_REQUIRED",
      "You do not have permission to view People Management."
    );
  }
}

/*
 * Owner and Ops Manager receive
 * agency-wide People visibility.
 *
 * Managers/custom ranked roles must be
 * able to manage BOTH:
 *
 * - every current role
 * - every current model
 *
 * assigned to the target.
 */
function canReadPerson(
  access:
    AccessContext,
  person:
    PersonReadRecord,
  visibleTeamGroupIds:
    Set<string>
): boolean {
  /*
   * Owner is the immutable system super-admin,
   * not an ordinary employee record.
   *
   * Hide Owner at the service layer so list and
   * direct-detail APIs cannot expose it even if
   * the caller knows the user ID.
   */
  if (
    person
      .roleMemberships
      .some(
        (
          membership
        ) =>
          membership.role
            .systemKey ===
          "OWNER"
      )
  ) {
    return false;
  }

  /*
   * Organization scope is now an additional
   * authorization boundary.
   *
   * Rank/model checks remain in place during
   * the migration, so hierarchy narrows access
   * without weakening the existing safeguards.
   */
  if (
    person.teamGroup
  ) {
    if (
      !visibleTeamGroupIds.has(
        person.teamGroup.id
      )
    ) {
      return false;
    }
  } else if (
    !isOwner(
      access
    )
  ) {
    /*
     * Fail closed for malformed legacy data.
     * Owner may still see an ungrouped employee
     * so the record can be repaired.
     */
    return false;
  }

  if (
    isOwner(
      access
    ) ||
    isOpsManager(
      access
    )
  ) {
    return true;
  }

  /*
   * Every Login Gate person should have
   * at least one role.
   *
   * If corrupted/incomplete data exists,
   * do not expose it to a Manager.
   */
  if (
    person
      .roleMemberships
      .length ===
    0
  ) {
    return false;
  }

  const rolesManageable =
    person
      .roleMemberships
      .every(
        (
          membership
        ) =>
          canAssignRole(
            access,
            membership.role
          )
      );

  if (
    !rolesManageable
  ) {
    return false;
  }

  const modelsManageable =
    person
      .modelAssignments
      .every(
        (
          assignment
        ) =>
          canAccessModel(
            access,
            assignment.modelId
          )
      );

  return modelsManageable;
}

function getInviteStatus(
  person:
    PersonReadRecord
) {
  const latestInvite =
    person.invites[0];

  if (
    person.status !==
    UserStatus.PENDING_SETUP
  ) {
    return {
      status:
        "SETUP_COMPLETE" as const,

      expiresAt:
        null,

      sentAt:
        null,
    };
  }

  if (
    !latestInvite
  ) {
    return {
      status:
        "INVITE_MISSING" as const,

      expiresAt:
        null,

      sentAt:
        null,
    };
  }

  if (
    latestInvite.acceptedAt
  ) {
    return {
      status:
        "INVITE_ACCEPTED" as const,

      expiresAt:
        latestInvite.expiresAt,

      sentAt:
        latestInvite.sentAt,
    };
  }

  if (
    latestInvite.revokedAt
  ) {
    return {
      status:
        "INVITE_REVOKED" as const,

      expiresAt:
        latestInvite.expiresAt,

      sentAt:
        latestInvite.sentAt,
    };
  }

  if (
    latestInvite
      .expiresAt
      .getTime() <=
    Date.now()
  ) {
    return {
      status:
        "INVITE_EXPIRED" as const,

      expiresAt:
        latestInvite.expiresAt,

      sentAt:
        latestInvite.sentAt,
    };
  }

  return {
    status:
      "INVITE_SENT" as const,

    expiresAt:
      latestInvite.expiresAt,

    sentAt:
      latestInvite.sentAt,
  };
}

function formatPerson(
  person:
    PersonReadRecord,
  access:
    AccessContext
) {
  const ownerSecurityAccess =
    isOwner(
      access
    );

  const emailMethod =
    person
      .twoFactorMethods
      .find(
        (method) =>
          method.type ===
          TwoFactorMethodType.EMAIL
      );

  const authenticatorMethod =
    person
      .twoFactorMethods
      .find(
        (method) =>
          method.type ===
          TwoFactorMethodType.AUTHENTICATOR
      );

  return {
    id:
      person.id,

    name:
      person.name,

    email:
      person.email,

    status:
      person.status,

    createdAt:
      person.createdAt,

    emailVerifiedAt:
      person.emailVerifiedAt,

    deactivatedAt:
      person.deactivatedAt,

    teamGroup:
      person.teamGroup,

    roles:
      person
        .roleMemberships
        .map(
          (
            membership
          ) => ({
            ...membership.role,

            assignedAt:
              membership.assignedAt,

            assignedByUserId:
              membership
                .assignedByUserId,
          })
        ),

    models:
      person
        .modelAssignments
        .map(
          (
            assignment
          ) => ({
            ...assignment.model,

            assignedAt:
              assignment.assignedAt,

            assignedByUserId:
              assignment
                .assignedByUserId,
          })
        ),

    setup:
      getInviteStatus(
        person
      ),

    /*
     * Build brief:
     *
     * Owners can see 2FA status and
     * last sign-in information.
     *
     * We deliberately do NOT expose:
     * - passwordHash
     * - 2FA code hashes
     * - authenticator secret
     * - session token hashes
     * - invite token hashes
     */
    security:
      ownerSecurityAccess
        ? {
            lastSignInAt:
              person.lastSignInAt,

            twoFactor: {
              email: {
                enabled:
                  emailMethod
                    ?.isEnabled ??
                  false,

                verifiedAt:
                  emailMethod
                    ?.verifiedAt ??
                  null,
              },

              authenticator: {
                enabled:
                  authenticatorMethod
                    ?.isEnabled ??
                  false,

                verifiedAt:
                  authenticatorMethod
                    ?.verifiedAt ??
                  null,
              },
            },
          }
        : undefined,
  };
}

export async function listPeople(
  access:
    AccessContext
) {
  assertPeopleReadAccess(
    access
  );

  const [
    people,
    visibleTeamGroupIds,
  ] =
    await Promise.all([
      prisma.user.findMany({
        ...personReadArgs,

        orderBy: [
          {
            name:
              "asc",
          },

          {
            createdAt:
              "asc",
          },
        ],
      }),

      getVisibleTeamGroupIds(
        access
      ),
    ]);

  return people
    .filter(
      (
        person
      ) =>
        canReadPerson(
          access,
          person,
          visibleTeamGroupIds
        )
    )
    .map(
      (
        person
      ) =>
        formatPerson(
          person,
          access
        )
    );
}

export async function getPersonDetail(
  userId:
    string,
  access:
    AccessContext
) {
  assertPeopleReadAccess(
    access
  );

  const [
    person,
    visibleTeamGroupIds,
  ] =
    await Promise.all([
      prisma.user.findUnique({
        where: {
          id:
            userId,
        },

        ...personReadArgs,
      }),

      getVisibleTeamGroupIds(
        access
      ),
    ]);

  if (!person) {
    throw new PeopleReadError(
      "USER_NOT_FOUND",
      "The user does not exist."
    );
  }

  if (
    !canReadPerson(
      access,
      person,
      visibleTeamGroupIds
    )
  ) {
    throw new PeopleReadError(
      "PERSON_NOT_VISIBLE",
      "You do not have access to view this person."
    );
  }

  return formatPerson(
    person,
    access
  );
}