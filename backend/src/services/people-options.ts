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

function getInviteDeliveryMode() {
  return (
    process.env
      .INVITE_DELIVERY_MODE
      ?.trim() ||
    process.env
      .EMAIL_DELIVERY_MODE
      ?.trim() ||
    ""
  ).toLowerCase();
}

function invitationsAreAvailable() {
  const mode =
    getInviteDeliveryMode();

if (
  mode === "smtp" ||
  mode === "gmail_api"
) {
  return true;
}

  return (
    mode === "console" &&
    process.env.NODE_ENV !==
      "production"
  );
}

export async function getPeopleManagementOptions(
  access:
    AccessContext
) {
  const [
    roles,
    models,
  ] =
    await Promise.all([
      prisma.role.findMany({
        select: {
          id: true,
          name: true,
          systemKey: true,
          rank: true,
          dataScope: true,
        },

        orderBy: [
          {
            rank:
              "asc",
          },

          {
            name:
              "asc",
          },
        ],
      }),

      prisma.agencyModel.findMany({
        select: {
          id: true,
          name: true,
          isActive: true,
        },

        orderBy: {
          name:
            "asc",
        },
      }),
    ]);

  const assignableRoles =
    roles.filter(
      (
        role
      ) =>
        canAssignRole(
          access,
          role
        )
    );

  const assignableModels =
    models.filter(
      (
        model
      ) =>
        canAccessModel(
          access,
          model.id
        )
    );

  const isOwnerUser =
    isOwner(
      access
    );

  return {
    roles:
      assignableRoles,

    models:
      assignableModels,

    capabilities: {
      isOwner:
        isOwnerUser,

      canManagePeople:
        hasPermission(
          access,
          "people.manage"
        ),

      canDeactivate:
        hasPermission(
          access,
          "people.deactivate"
        ),

      canDelete:
        isOwnerUser &&
        hasPermission(
          access,
          "people.delete"
        ),

      canResetTwoFactor:
        isOwnerUser &&
        hasPermission(
          access,
          "two_factor.reset"
        ),

      invitesAvailable:
        invitationsAreAvailable(),
    },
  };
}
