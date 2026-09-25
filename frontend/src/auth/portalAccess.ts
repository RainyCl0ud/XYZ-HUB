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

  const canManageRoles =
    isOwner &&
    (
      access?.permissions.includes(
        "roles.manage"
      ) ??
      false
    );

  /*
   * Build Brief clarification: Audit Log is
   * read-only for Owner and Dev.
   */
  const canViewAudit =
    isOwner ||
    isDev;

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
    canManageRoles,
    canViewAudit,
  };
}

export type PortalModule =
  | "qa"
  | "qa-config"
  | "audit";

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

    case "audit":
      return capabilities
        .canViewAudit;

    default:
      return false;
  }
}
