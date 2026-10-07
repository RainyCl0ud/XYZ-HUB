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
  listTeamGroups,
} from "./team-hierarchy.js";

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
    organization,
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

      listTeamGroups(
        access
      ),
    ]);

  /*
   * canAssignRole() is the single authority gate for role assignment.
   * It already reserves Owner, Ops Manager, Dev, Accountant, Model and
   * General Staff for Owners. Keeping Owner in this list for an Owner
   * allows the build-brief promotion flow without exposing it to others.
   */
  const assignableRoles =
    roles.filter(
      (role) =>
        canAssignRole(
          access,
          role
        )
    );

  const assignableModels =
    models.filter(
      (model) =>
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

    organization,

    capabilities: {
      isOwner:
        isOwnerUser,

      canManagePeople:
        hasPermission(
          access,
          "people.access"
        ),

      canCreatePeople:
        hasPermission(
          access,
          "people.create"
        ),

      canAssignRoles:
        hasPermission(
          access,
          "people.assign_roles"
        ),

      canManageOrganization:
        isOwnerUser,

      canDeactivate:
        hasPermission(
          access,
          "people.status.manage"
        ),

      /*
       * Permanent deletion and 2FA migration are handled in
       * the next destructive-account authorization subpass.
       */
      canDelete:
        hasPermission(
          access,
          "people.delete"
        ),

      canResetTwoFactor:
        hasPermission(
          access,
          "two_factor.reset"
        ),

      invitesAvailable:
        invitationsAreAvailable(),
    },
  };
}
