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

  const canViewQa =
    isOwner ||
    isOps ||
    isManager ||
    isQc ||
    isDev;

  const canConfigureQa =
    isOwner ||
    isOps ||
    isManager ||
    isDev;

  const canManageQaIncidents =
    isOwner ||
    isOps ||
    isManager ||
    isDev;

  const canManagePeople =
    access?.permissions.includes(
      "people.manage"
    ) ??
    false;

  const canManageModels =
    canManagePeople &&
    (
      isOwner ||
      isOps
    );

  const canViewStrikes =
    access?.permissions.includes(
      "strikes.view"
    ) ??
    false;

  const canIssueStrikes =
    access?.permissions.includes(
      "strikes.issue"
    ) ??
    false;

  const canVoidStrikes =
    access?.permissions.includes(
      "strikes.void"
    ) ??
    false;

  const canConfigureStrikes =
    access?.permissions.includes(
      "strikes.configure"
    ) ??
    false;

  const canManageRoles =
    isOwner &&
    (
      access?.permissions.includes(
        "roles.manage"
      ) ??
      false
    );

  /*
   * Audit Log is permanently reserved for the
   * system-managed Owner role and is not delegable.
   */
  const canViewAudit =
    isOwner;

  return {
    isOwner,
    isOps,
    isManager,
    isQc,
    isDev,
    canViewQa,
    canConfigureQa,
    canManageQaIncidents,
    canManagePeople,
    canManageModels,
    canViewStrikes,
    canIssueStrikes,
    canVoidStrikes,
    canConfigureStrikes,
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
  const capabilities =
    getPortalCapabilities(
      access
    );

  switch (
    module
  ) {
    case "qa":
      return capabilities
        .canViewQa;

    case "qa-config":
      return capabilities
        .canConfigureQa;

    default:
      return false;
  }
}
