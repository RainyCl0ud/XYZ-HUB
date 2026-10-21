import {
  prisma,
} from "../lib/prisma.js";

import {
  canAccessModel,
  canAssignRole,
  hasPermission,
  isOwner,
  type AccessContext,
  canInvitePeople,
  canInviteRole,
  canAssignInviteModel,
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
        where: {
          archivedAt:
            null,
        },

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
          creatorUserId: true,
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


  const inviteRoles =
    roles.filter(
      (role) =>
        canInviteRole(
          access,
          role
        )
    );

  const inviteModels =
    models.filter(
      (model) =>
        model.isActive &&
        canAssignInviteModel(
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
      assignableModels.map(({ id, name, isActive }) => ({ id, name, isActive })),

    inviteRoles,
    inviteModels: inviteModels.map(({ id, name, isActive }) => ({ id, name, isActive })),

    creatorModels: isOwnerUser ? models : [],

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
        canInvitePeople(access),

      canAssignRoles:
        hasPermission(
          access,
          "people.assign_roles"
        ),

      canAssignModels:
        hasPermission(
          access,
          "models.edit"
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
