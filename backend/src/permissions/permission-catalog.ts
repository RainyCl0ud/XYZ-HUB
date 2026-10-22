import { CHAT_PERMISSION_DEFINITIONS } from "./chat-permissions.js";

export type PermissionDefinition = {
  key: string;
  name: string;
  description: string;
  pageKey: string;
  categoryKey: string;
  actionKey: string;
  requires?: readonly string[];
};


export const PERMISSION_CATALOG:
  readonly PermissionDefinition[] =
  [
    /*
     * =====================================================
     * DASHBOARD
     * =====================================================
     */
    {
      key:
        "dashboard.view",

      name:
        "View Dashboard",

      description:
        "Access the main management dashboard.",

      pageKey:
        "dashboard",

      categoryKey:
        "access",

      actionKey:
        "view",
    },


    /*
     * =====================================================
     * EMPLOYEE MANAGEMENT
     * =====================================================
     */
    {
      key:
        "people.access",

      name:
        "Access Employee Management",

      description:
        "Open Employee Management and view employees within the allowed organization scope.",

      pageKey:
        "people",

      categoryKey:
        "access",

      actionKey:
        "access",
    },

    {
      key:
        "people.profile.view",

      name:
        "View Employee Profiles",

      description:
        "Open employee profile pages and review permitted employee information.",

      pageKey:
        "people",

      categoryKey:
        "profiles",

      actionKey:
        "view",

      requires: [
        "people.access",
      ],
    },

    {
      key:
        "people.create",

      name:
        "Create Employees",

      description:
        "Invite new employees within the allowed role, team, and creator scope.",

      pageKey:
        "people",

      categoryKey:
        "employees",

      actionKey:
        "create",

      requires: [
        "people.access",
      ],
    },

    {
      key:
        "people.assign_roles",

      name:
        "Assign Roles",

      description:
        "Assign permitted roles to employees within the allowed authority scope.",

      pageKey:
        "people",

      categoryKey:
        "roles",

      actionKey:
        "assign",

      requires: [
        "people.access",
        "people.profile.view",
      ],
    },

    {
      key:
        "two_factor.reset",

      name:
        "Reset Employee 2FA",

      description:
        "Reset another employee's two-factor authentication and revoke their active sessions.",

      pageKey:
        "people",

      categoryKey:
        "security",

      actionKey:
        "reset_2fa",

      requires: [
        "people.access",
        "people.profile.view",
      ],
    },


    /*
     * =====================================================
     * QUALITY & INCIDENTS
     * =====================================================
     */
    {
      key:
        "quality.access",

      name:
        "Access Quality & Incidents",

      description:
        "Access the Quality & Incidents workspace.",

      pageKey:
        "quality",

      categoryKey:
        "access",

      actionKey:
        "access",
    },

    {
      key:
        "quality.incidents.view",

      name:
        "View Incidents",

      description:
        "View QA incidents within the allowed creator scope.",

      pageKey:
        "quality",

      categoryKey:
        "incidents",

      actionKey:
        "view",

      requires: [
        "quality.access",
      ],
    },

    {
      key:
        "quality.incidents.create",

      name:
        "Create Incidents",

      description:
        "Log new QA incidents within the allowed creator scope.",

      pageKey:
        "quality",

      categoryKey:
        "incidents",

      actionKey:
        "create",

      requires: [
        "quality.access",
        "quality.incidents.view",
      ],
    },

    {
      key:
        "quality.incidents.resolve",

      name:
        "Resolve Incidents",

      description:
        "Resolve open QA incidents within the allowed creator scope.",

      pageKey:
        "quality",

      categoryKey:
        "incidents",

      actionKey:
        "resolve",

      requires: [
        "quality.access",
        "quality.incidents.view",
      ],
    },

    {
      key:
        "quality.incidents.void",

      name:
        "Void Incidents",

      description:
        "Void open QA incidents within the allowed creator scope.",

      pageKey:
        "quality",

      categoryKey:
        "incidents",

      actionKey:
        "void",

      requires: [
        "quality.access",
        "quality.incidents.view",
      ],
    },

    {
      key:
        "quality.chatters.view",

      name:
        "View QA Profiles",

      description:
        "View chatter and QA profile information within the allowed creator scope.",

      pageKey:
        "quality",

      categoryKey:
        "qa",

      actionKey:
        "view",

      requires: [
        "quality.access",
      ],
    },

    {
      key:
        "quality.chatters.manage",

      name:
        "Manage QA Profiles",

      description:
        "Manage QA chatter profiles where the current QA workflow supports changes.",

      pageKey:
        "quality",

      categoryKey:
        "qa",

      actionKey:
        "manage",

      requires: [
        "quality.access",
        "quality.chatters.view",
      ],
    },

    {
      key:
        "quality.rules.view",

      name:
        "View Rules",

      description:
        "View QA rule and configuration information.",

      pageKey:
        "quality",

      categoryKey:
        "rules",

      actionKey:
        "view",

      requires: [
        "quality.access",
      ],
    },

    {
      key:
        "quality.rules.manage",

      name:
        "Manage Rules",

      description:
        "Create, edit, archive, and configure QA rules where supported.",

      pageKey:
        "quality",

      categoryKey:
        "rules",

      actionKey:
        "manage",

      requires: [
        "quality.access",
        "quality.rules.view",
      ],
    },


    /*
     * =====================================================
     * STRIKE MANAGEMENT
     * =====================================================
     */
    {
      key:
        "strikes.access",

      name:
        "Access Strike Management",

      description:
        "Access the Strike Management workspace.",

      pageKey:
        "strikes",

      categoryKey:
        "access",

      actionKey:
        "access",
    },

    {
      key:
        "strikes.view",

      name:
        "View Strikes",

      description:
        "View disciplinary Strike records within the allowed organization scope.",

      pageKey:
        "strikes",

      categoryKey:
        "strikes",

      actionKey:
        "view",

      requires: [
        "strikes.access",
      ],
    },

    {
      key:
        "strikes.issue",

      name:
        "Issue Strikes",

      description:
        "Issue disciplinary Strikes to eligible employees.",

      pageKey:
        "strikes",

      categoryKey:
        "strikes",

      actionKey:
        "issue",

      requires: [
        "strikes.access",
        "strikes.view",
      ],
    },

    {
      key:
        "strikes.void",

      name:
        "Void Strikes",

      description:
        "Void previously issued disciplinary Strikes when permitted.",

      pageKey:
        "strikes",

      categoryKey:
        "strikes",

      actionKey:
        "void",

      requires: [
        "strikes.access",
        "strikes.view",
      ],
    },

    {
      key:
        "strikes.reasons.view",

      name:
        "View Reasons",

      description:
        "View the Strike reason catalog.",

      pageKey:
        "strikes",

      categoryKey:
        "reasons",

      actionKey:
        "view",

      requires: [
        "strikes.access",
      ],
    },

    {
      key:
        "strikes.reasons.create",

      name:
        "Add Reasons",

      description:
        "Add new Strike reasons.",

      pageKey:
        "strikes",

      categoryKey:
        "reasons",

      actionKey:
        "create",

      requires: [
        "strikes.access",
        "strikes.reasons.view",
      ],
    },

    {
      key:
        "strikes.reasons.edit",

      name:
        "Edit Reasons",

      description:
        "Edit existing Strike reasons.",

      pageKey:
        "strikes",

      categoryKey:
        "reasons",

      actionKey:
        "edit",

      requires: [
        "strikes.access",
        "strikes.reasons.view",
      ],
    },

    {
      key:
        "strikes.reasons.archive",

      name:
        "Archive or Reactivate Reasons",

      description:
        "Deactivate or reactivate Strike reasons.",

      pageKey:
        "strikes",

      categoryKey:
        "reasons",

      actionKey:
        "archive",

      requires: [
        "strikes.access",
        "strikes.reasons.view",
      ],
    },

    {
      key:
        "strikes.ladder.view",

      name:
        "View Strike Ladder Configuration",

      description:
        "View the current Strike ladder configuration and version history.",

      pageKey:
        "strikes",

      categoryKey:
        "ladder",

      actionKey:
        "view",

      requires: [
        "strikes.access",
      ],
    },

    {
      key:
        "strikes.ladder.edit",

      name:
        "Edit Strike Ladder Configuration",

      description:
        "Create a new Strike ladder configuration version.",

      pageKey:
        "strikes",

      categoryKey:
        "ladder",

      actionKey:
        "edit",

      requires: [
        "strikes.access",
        "strikes.ladder.view",
      ],
    },


    /*
     * =====================================================
     * CREATORS
     * =====================================================
     */
    {
      key:
        "models.access",

      name:
        "Access Creators",

      description:
        "View the creator catalog.",

      pageKey:
        "models",

      categoryKey:
        "access",

      actionKey:
        "access",
    },

    {
      key:
        "models.create",

      name:
        "Create Creators",

      description:
        "Add creators to the agency catalog.",

      pageKey:
        "models",

      categoryKey:
        "creators",

      actionKey:
        "create",

      requires: [
        "models.access",
      ],
    },

    {
      key:
        "models.edit",

      name:
        "Edit Creators",

      description:
        "Rename creators in the agency catalog.",

      pageKey:
        "models",

      categoryKey:
        "creators",

      actionKey:
        "edit",

      requires: [
        "models.access",
      ],
    },

    {
      key:
        "models.status.manage",

      name:
        "Activate or Deactivate Creators",

      description:
        "Change creator catalog status while preserving existing history.",

      pageKey:
        "models",

      categoryKey:
        "creators",

      actionKey:
        "manage_status",

      requires: [
        "models.access",
      ],
    },


    /*
     * =====================================================
     * ROLE SETTINGS
     * =====================================================
     */
    {
      key:
        "roles.access",

      name:
        "Access Role Settings",

      description:
        "View the Role Settings workspace.",

      pageKey:
        "roles",

      categoryKey:
        "access",

      actionKey:
        "access",
    },

    {
      key:
        "roles.manage",

      name:
        "Manage Roles",

      description:
        "Create, edit, delete, and configure role permissions.",

      pageKey:
        "roles",

      categoryKey:
        "roles",

      actionKey:
        "manage",

      requires: [
        "roles.access",
      ],
    },


    /*
     * =====================================================
     * AUDIT
     *
     * audit.view is intentionally NOT reused here because the
     * Staging snapshot contains a stale non-Owner assignment.
     * audit.access starts clean from actual effective access.
     * =====================================================
     */
    // Block 2 ordinary creator chat (separately enabled for rollout).
    ...CHAT_PERMISSION_DEFINITIONS.filter((permission) => permission.key !== "chat.private.general.review"),
  ];


export const MANAGED_PERMISSION_KEYS =
  PERMISSION_CATALOG.map(
    (
      permission
    ) =>
      permission.key
  );


export const MANAGED_PERMISSION_KEY_SET =
  new Set<string>(
    MANAGED_PERMISSION_KEYS
  );


export const PERMISSION_DEPENDENCIES:
  Readonly<
    Record<
      string,
      readonly string[]
    >
  > =
    Object.fromEntries(
      PERMISSION_CATALOG.map(
        (
          permission
        ) => [
          permission.key,
          permission.requires ??
          [],
        ]
      )
    );
