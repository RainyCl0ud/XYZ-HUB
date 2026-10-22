export type PortalAccessShape = {
  permissions:
    string[];

  roles: {
    systemKey:
      string | null;
  }[];

  canSeeAllModels:
    boolean;
};


export const PORTAL_PERMISSION_DEPENDENCIES:
  Readonly<
    Record<
      string,
      readonly string[]
    >
  > = {
  "chat.ordinary.access": ["chat.access"],
  "chat.private.all": ["chat.access"],
  "chat.private.general.review": ["chat.access"],
  "chat.private.creator": ["chat.access"],
  "chat.private.creator.review": ["chat.access"],
  "chat.private.staff": ["chat.access"],
  "chat.private.staff.review": ["chat.access"],
  "chat.private.accountant": ["chat.access"],
  "chat.private.general": ["chat.access"],
  "chat.areas.all": ["chat.access"],
  "chat.channels.all": ["chat.access"],
  "chat.channels.post_all": ["chat.access"],
  "chat.channels.manage": ["chat.access"],
  "chat.messages.send": ["chat.access"],
  "chat.messages.edit_own": ["chat.access"],
  "chat.trial_feedback.restricted": ["chat.access"],
  "chat.trial_feedback.review": ["chat.access"],
  "chat.archives.view": ["chat.access"],
  "people.profile.view": [
    "people.access",
  ],

  "people.create": [
    "people.access",
  ],

  "people.assign_roles": [
    "people.access",
    "people.profile.view",
  ],

  "people.status.manage": [
    "people.access",
    "people.profile.view",
  ],

  "people.delete": [
    "people.access",
    "people.profile.view",
  ],

  "two_factor.reset": [
    "people.access",
    "people.profile.view",
  ],

  "quality.incidents.view": [
    "quality.access",
  ],

  "quality.incidents.create": [
    "quality.access",
    "quality.incidents.view",
  ],

  "quality.incidents.resolve": [
    "quality.access",
    "quality.incidents.view",
  ],

  "quality.incidents.void": [
    "quality.access",
    "quality.incidents.view",
  ],

  "quality.chatters.view": [
    "quality.access",
  ],

  "quality.chatters.manage": [
    "quality.access",
    "quality.chatters.view",
  ],

  "quality.rules.view": [
    "quality.access",
  ],

  "quality.rules.manage": [
    "quality.access",
    "quality.rules.view",
  ],

  "strikes.view": [
    "strikes.access",
  ],

  "strikes.issue": [
    "strikes.access",
    "strikes.view",
  ],

  "strikes.void": [
    "strikes.access",
    "strikes.view",
  ],

  "strikes.reasons.view": [
    "strikes.access",
  ],

  "strikes.reasons.create": [
    "strikes.access",
    "strikes.reasons.view",
  ],

  "strikes.reasons.edit": [
    "strikes.access",
    "strikes.reasons.view",
  ],

  "strikes.reasons.archive": [
    "strikes.access",
    "strikes.reasons.view",
  ],

  "strikes.ladder.view": [
    "strikes.access",
  ],

  "strikes.ladder.edit": [
    "strikes.access",
    "strikes.ladder.view",
  ],

  "models.create": [
    "models.access",
  ],

  "models.edit": [
    "models.access",
  ],

  "models.status.manage": [
    "models.access",
  ],

  "roles.manage": [
    "roles.access",
  ],
};


function rawPermission(
  access:
    PortalAccessShape | null,
  key:
    string
) {
  return (
    access?.permissions.includes(
      key
    ) ??
    false
  );
}


function hasPermissionRecursive(
  access:
    PortalAccessShape | null,
  key:
    string,
  visiting:
    Set<string>
): boolean {
  if (
    !rawPermission(
      access,
      key
    )
  ) {
    return false;
  }

  if (
    visiting.has(
      key
    )
  ) {
    return false;
  }

  visiting.add(
    key
  );

  const requirements =
    PORTAL_PERMISSION_DEPENDENCIES[
      key
    ] ??
    [];

  const allowed =
    requirements.every(
      (
        required
      ) =>
        hasPermissionRecursive(
          access,
          required,
          visiting
        )
    );

  visiting.delete(
    key
  );

  return allowed;
}


export function hasPortalPermission(
  access:
    PortalAccessShape | null,
  key:
    string
) {
  return hasPermissionRecursive(
    access,
    key,
    new Set<string>()
  );
}


function hasSystemRole(
  access:
    PortalAccessShape | null,
  key:
    string
) {
  return (
    access?.roles.some(
      (
        role
      ) =>
        role.systemKey ===
        key
    ) ??
    false
  );
}


export function getPortalCapabilities(
  access:
    PortalAccessShape | null
) {
  const isOwner =
    hasSystemRole(
      access,
      "OWNER"
    );

  const isOps =
    hasSystemRole(
      access,
      "OPS_MANAGER"
    );

  const isManager =
    hasSystemRole(
      access,
      "MANAGER"
    );

  const isQc =
    hasSystemRole(
      access,
      "QC"
    );

  const isDev =
    hasSystemRole(
      access,
      "DEV"
    );

  const canViewDashboard =
    hasPortalPermission(
      access,
      "dashboard.view"
    );

  const canViewQa =
    hasPortalPermission(
      access,
      "quality.access"
    );

  const canViewQaIncidents =
    hasPortalPermission(
      access,
      "quality.incidents.view"
    );

  const canCreateQaIncidents =
    hasPortalPermission(
      access,
      "quality.incidents.create"
    );

  const canResolveQaIncidents =
    hasPortalPermission(
      access,
      "quality.incidents.resolve"
    );

  const canVoidQaIncidents =
    hasPortalPermission(
      access,
      "quality.incidents.void"
    );

  const canManageQaIncidents =
    canCreateQaIncidents ||
    canResolveQaIncidents ||
    canVoidQaIncidents;

  const canViewQaProfiles =
    hasPortalPermission(
      access,
      "quality.chatters.view"
    );

  const canManageQaProfiles =
    hasPortalPermission(
      access,
      "quality.chatters.manage"
    );

  const canViewRules =
    hasPortalPermission(
      access,
      "quality.rules.view"
    );

  const canManageRules =
    hasPortalPermission(
      access,
      "quality.rules.manage"
    );

  const canConfigureQa =
    canManageRules;

  const canManagePeople =
    hasPortalPermission(
      access,
      "people.access"
    );

  const canViewPeopleProfiles =
    hasPortalPermission(
      access,
      "people.profile.view"
    );

  const canCreatePeople =
    hasPortalPermission(
      access,
      "people.create"
    );

  const canAssignRoles =
    hasPortalPermission(
      access,
      "people.assign_roles"
    );

  const canManagePeopleStatus =
    hasPortalPermission(
      access,
      "people.status.manage"
    );

  const canDeletePeople =
    hasPortalPermission(
      access,
      "people.delete"
    );

  const canResetTwoFactor =
    hasPortalPermission(
      access,
      "two_factor.reset"
    );

  const canManageModels =
    hasPortalPermission(
      access,
      "models.access"
    );

  const canCreateModels =
    hasPortalPermission(
      access,
      "models.create"
    );

  const canEditModels =
    hasPortalPermission(
      access,
      "models.edit"
    );

  const canManageModelStatus =
    hasPortalPermission(
      access,
      "models.status.manage"
    );

  const canAccessStrikeManagement =
    hasPortalPermission(
      access,
      "strikes.access"
    );

  const canViewStrikes =
    hasPortalPermission(
      access,
      "strikes.view"
    );

  const canIssueStrikes =
    hasPortalPermission(
      access,
      "strikes.issue"
    );

  const canVoidStrikes =
    hasPortalPermission(
      access,
      "strikes.void"
    );

  const canViewStrikeReasons =
    hasPortalPermission(
      access,
      "strikes.reasons.view"
    );

  const canCreateStrikeReasons =
    hasPortalPermission(
      access,
      "strikes.reasons.create"
    );

  const canEditStrikeReasons =
    hasPortalPermission(
      access,
      "strikes.reasons.edit"
    );

  const canArchiveStrikeReasons =
    hasPortalPermission(
      access,
      "strikes.reasons.archive"
    );

  const canViewStrikeLadder =
    hasPortalPermission(
      access,
      "strikes.ladder.view"
    );

  const canEditStrikeLadder =
    hasPortalPermission(
      access,
      "strikes.ladder.edit"
    );

  const canConfigureStrikes =
    canCreateStrikeReasons ||
    canEditStrikeReasons ||
    canArchiveStrikeReasons ||
    canEditStrikeLadder;

  const canViewRoles =
    hasPortalPermission(
      access,
      "roles.access"
    );

  const canManageRoles =
    hasPortalPermission(
      access,
      "roles.manage"
    );

  const canViewAudit =
    hasPortalPermission(
      access,
      "audit.access"
    );

  return {
    isOwner,
    isOps,
    isManager,
    isQc,
    isDev,

    canViewDashboard,

    canViewQa,
    canViewQaIncidents,
    canCreateQaIncidents,
    canResolveQaIncidents,
    canVoidQaIncidents,
    canManageQaIncidents,
    canViewQaProfiles,
    canManageQaProfiles,
    canViewRules,
    canManageRules,
    canConfigureQa,

    canManagePeople,
    canViewPeopleProfiles,
    canCreatePeople,
    canAssignRoles,
    canManagePeopleStatus,
    canDeletePeople,
    canResetTwoFactor,

    canManageModels,
    canCreateModels,
    canEditModels,
    canManageModelStatus,

    canAccessStrikeManagement,
    canViewStrikes,
    canIssueStrikes,
    canVoidStrikes,
    canViewStrikeReasons,
    canCreateStrikeReasons,
    canEditStrikeReasons,
    canArchiveStrikeReasons,
    canViewStrikeLadder,
    canEditStrikeLadder,
    canConfigureStrikes,

    canViewRoles,
    canManageRoles,
    canViewAudit,
  };
}


export type PortalModule =
  | "qa"
  | "qa-config";


export function canAccessPortalModule(
  access:
    PortalAccessShape | null,
  module:
    PortalModule
) {
  switch (module) {
    case "qa":
      return hasPortalPermission(
        access,
        "quality.access"
      );

    case "qa-config":
      return hasPortalPermission(
        access,
        "quality.rules.manage"
      );

    default:
      return false;
  }
}
