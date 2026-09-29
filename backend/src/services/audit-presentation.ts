import {
  prisma,
} from "../lib/prisma.js";

import type {
  AuditEvent,
} from "./audit-store.js";

type JsonRecord =
  Record<
    string,
    unknown
  >;

export type AuditDisplayParty = {
  label: string;
  secondary: string | null;
  kind: string | null;
};

export type AuditDisplayChange = {
  label: string;
  before: string | null;
  after: string | null;
  added: string[];
  removed: string[];
};

export type PresentedAuditEvent = {
  id: string;
  occurredAt: string;
  action: string;
  actionLabel: string;
  success: boolean;
  statusCode: number;
  actor: AuditDisplayParty;
  target: AuditDisplayParty;
  summary: string;
  changes: AuditDisplayChange[];
  source: {
    ipAddress: string | null;
    deviceLabel: string | null;
  };
};

function asRecord(
  value:
    unknown
):
  JsonRecord |
  null {
  if (
    value &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value
    )
  ) {
    return value as JsonRecord;
  }

  return null;
}

function asString(
  value:
    unknown
):
  string |
  null {
  return typeof value ===
    "string"
    ? value
    : null;
}

function asBoolean(
  value:
    unknown
):
  boolean |
  null {
  return typeof value ===
    "boolean"
    ? value
    : null;
}

function asNumber(
  value:
    unknown
):
  number |
  null {
  return typeof value ===
    "number" &&
    Number.isFinite(
      value
    )
    ? value
    : null;
}

function asStringArray(
  value:
    unknown
):
  string[] {
  if (
    !Array.isArray(
      value
    )
  ) {
    return [];
  }

  return value.filter(
    (
      item
    ): item is string =>
      typeof item ===
      "string"
  );
}

function humanize(
  value:
    string
) {
  return value
    .replace(
      /[._-]+/g,
      " "
    )
    .replace(
      /\b\w/g,
      (
        character
      ) =>
        character.toUpperCase()
    );
}

function formatDataScope(
  value:
    unknown
) {
  switch (
    value
  ) {
    case "ALL":
      return "All data";

    case "SELF_AND_TEAM":
      return "Self + team";

    case "SELF":
      return "Self only";

    default:
      return asString(
        value
      );
  }
}

function formatStatus(
  value:
    unknown
) {
  const status =
    asString(
      value
    );

  if (
    !status
  ) {
    return null;
  }

  return humanize(
    status
  );
}

function actionLabel(
  action:
    string
) {
  const labels:
    Record<
      string,
      string
    > = {
    "auth.password_verified":
      "Password verified",
    "auth.sign_in_succeeded":
      "Sign-in completed",
    "auth.sign_in_failed":
      "Sign-in failed",
    "invite.created":
      "Invitation sent",
    "invite.accepted":
      "Invitation accepted",
    "invite.resent":
      "Invitation resent",
    "people.access_changed":
      "Access updated",
    "people.deactivated":
      "Account deactivated",
    "people.reactivated":
      "Account reactivated",
    "people.deleted":
      "Account deleted",
    "two_factor.reset":
      "Two-factor reset",
    "model.created":
      "Creator added",
    "model.renamed":
      "Creator renamed",
    "model.deactivated":
      "Creator deactivated",
    "model.reactivated":
      "Creator reactivated",
    "role.created":
      "Role created",
    "role.updated":
      "Role updated",
    "role.deleted":
      "Role deleted",
  };

  return (
    labels[
      action
    ] ??
    humanize(
      action
    )
  );
}

function collectSnapshotIds(
  record:
    JsonRecord |
    null,
  roleIds:
    Set<string>,
  modelIds:
    Set<string>,
  userIds:
    Set<string>
) {
  if (
    !record
  ) {
    return;
  }

  const id =
    asString(
      record.id
    );

  const email =
    asString(
      record.email
    );

  if (
    id &&
    email
  ) {
    userIds.add(
      id
    );
  }

  for (
    const roleId
    of asStringArray(
      record.roleIds
    )
  ) {
    roleIds.add(
      roleId
    );
  }

  for (
    const modelId
    of asStringArray(
      record.modelIds
    )
  ) {
    modelIds.add(
      modelId
    );
  }
}

function pushChange(
  changes:
    AuditDisplayChange[],
  label:
    string,
  before:
    string |
    null,
  after:
    string |
    null
) {
  if (
    before ===
    after
  ) {
    return;
  }

  changes.push({
    label,
    before,
    after,
    added: [],
    removed: [],
  });
}

function snapshotName(
  record:
    JsonRecord |
    null
) {
  return (
    asString(
      record?.name
    ) ??
    asString(
      record?.email
    )
  );
}

function snapshotItems(
  record:
    JsonRecord |
    null,
  idKey:
    string,
  nameKey:
    string,
  names:
    Map<
      string,
      string
    >
) {
  if (
    !record
  ) {
    return [];
  }

  const snapshotNames =
    asStringArray(
      record[
        nameKey
      ]
    );

  if (
    snapshotNames.length >
      0
  ) {
    return snapshotNames;
  }

  return asStringArray(
    record[
      idKey
    ]
  ).map(
    (
      id
    ) =>
      names.get(
        id
      ) ??
      "Unavailable"
  );
}

function permissionItems(
  value:
    unknown
) {
  return asStringArray(
    value
  ).map(
    humanize
  );
}

function pushListChange(
  changes:
    AuditDisplayChange[],
  label:
    string,
  beforeItems:
    string[],
  afterItems:
    string[]
) {
  const beforeSet =
    new Set(
      beforeItems
    );

  const afterSet =
    new Set(
      afterItems
    );

  const added =
    afterItems.filter(
      (
        item
      ) =>
        !beforeSet.has(
          item
        )
    );

  const removed =
    beforeItems.filter(
      (
        item
      ) =>
        !afterSet.has(
          item
        )
    );

  if (
    added.length ===
      0 &&
    removed.length ===
      0
  ) {
    return;
  }

  changes.push({
    label,
    before:
      beforeItems.length >
        0
        ? beforeItems.join(
            ", "
          )
        : "None",
    after:
      afterItems.length >
        0
        ? afterItems.join(
            ", "
          )
        : "None",
    added,
    removed,
  });
}

function formatDeviceLabel(
  userAgent:
    string |
    null
) {
  if (
    !userAgent
  ) {
    return null;
  }

  let browser:
    string |
    null =
    null;

  const edge =
    userAgent.match(
      /Edg\/(\d+)/
    );

  const chrome =
    userAgent.match(
      /Chrome\/(\d+)/
    );

  const firefox =
    userAgent.match(
      /Firefox\/(\d+)/
    );

  const safari =
    userAgent.match(
      /Version\/(\d+)[\d.]*.*Safari\//
    );

  if (
    edge
  ) {
    browser =
      "Edge " +
      edge[1];
  } else if (
    chrome
  ) {
    browser =
      "Chrome " +
      chrome[1];
  } else if (
    firefox
  ) {
    browser =
      "Firefox " +
      firefox[1];
  } else if (
    safari
  ) {
    browser =
      "Safari " +
      safari[1];
  }

  let device:
    string |
    null =
    null;

  if (
    /Windows NT/i.test(
      userAgent
    )
  ) {
    device =
      "Windows";
  } else if (
    /iPhone|iPad|iPod/i.test(
      userAgent
    )
  ) {
    device =
      "iOS";
  } else if (
    /Android/i.test(
      userAgent
    )
  ) {
    device =
      "Android";
  } else if (
    /Mac OS X|Macintosh/i.test(
      userAgent
    )
  ) {
    device =
      "macOS";
  } else if (
    /Linux/i.test(
      userAgent
    )
  ) {
    device =
      "Linux";
  }

  if (
    !browser &&
    !device
  ) {
    return "Unknown browser / device";
  }

  return [
    browser ??
      "Unknown browser",
    device ??
      "Unknown device",
  ].join(
    " · "
  );
}

function buildChanges(
  event:
    AuditEvent,
  roleNames:
    Map<
      string,
      string
    >,
  modelNames:
    Map<
      string,
      string
    >
) {
  if (
    !event.success
  ) {
    return [];
  }

  const metadata =
    asRecord(
      event.metadata
    );

  const before =
    asRecord(
      metadata?.before
    );

  const after =
    asRecord(
      metadata?.after
    );

  const changes:
    AuditDisplayChange[] = [];

  if (
    event.targetType ===
      "user"
  ) {
    if (
      before &&
      after
    ) {
      pushChange(
        changes,
        "Account status",
        formatStatus(
          before.status
        ),
        formatStatus(
          after.status
        )
      );

      pushListChange(
        changes,
        "Roles",
        snapshotItems(
          before,
          "roleIds",
          "roleNames",
          roleNames
        ),
        snapshotItems(
          after,
          "roleIds",
          "roleNames",
          roleNames
        )
      );

      pushListChange(
        changes,
        "Creators",
        snapshotItems(
          before,
          "modelIds",
          "modelNames",
          modelNames
        ),
        snapshotItems(
          after,
          "modelIds",
          "modelNames",
          modelNames
        )
      );
    } else if (
      !before &&
      after
    ) {
      pushChange(
        changes,
        "Account",
        null,
        snapshotName(
          after
        )
      );

      pushListChange(
        changes,
        "Roles",
        [],
        snapshotItems(
          after,
          "roleIds",
          "roleNames",
          roleNames
        )
      );

      pushListChange(
        changes,
        "Creators",
        [],
        snapshotItems(
          after,
          "modelIds",
          "modelNames",
          modelNames
        )
      );
    } else if (
      before &&
      !after &&
      event.action ===
        "people.deleted"
    ) {
      pushChange(
        changes,
        "Account",
        snapshotName(
          before
        ),
        "Deleted"
      );
    }

    return changes;
  }

  if (
    event.targetType ===
      "model"
  ) {
    pushChange(
      changes,
      "Creator name",
      asString(
        before?.name
      ),
      asString(
        after?.name
      )
    );

    const beforeActive =
      asBoolean(
        before?.isActive
      );

    const afterActive =
      asBoolean(
        after?.isActive
      );

    pushChange(
      changes,
      "Creator status",
      beforeActive ===
        null
        ? null
        : beforeActive
          ? "Active"
          : "Inactive",
      afterActive ===
        null
        ? null
        : afterActive
          ? "Active"
          : "Inactive"
    );

    return changes;
  }

  if (
    event.targetType ===
      "role"
  ) {
    pushChange(
      changes,
      "Role name",
      asString(
        before?.name
      ),
      asString(
        after?.name
      )
    );

    const beforeRank =
      asNumber(
        before?.rank
      );

    const afterRank =
      asNumber(
        after?.rank
      );

    pushChange(
      changes,
      "Rank",
      beforeRank ===
        null
        ? null
        : String(
            beforeRank
          ),
      afterRank ===
        null
        ? null
        : String(
            afterRank
          )
    );

    pushChange(
      changes,
      "Data scope",
      formatDataScope(
        before?.dataScope
      ),
      formatDataScope(
        after?.dataScope
      )
    );

    pushListChange(
      changes,
      "Permissions",
      before
        ? permissionItems(
            before.permissions
          )
        : [],
      after
        ? permissionItems(
            after.permissions
          )
        : []
    );

    return changes;
  }

  return changes;
}

function buildSummary(
  event:
    AuditEvent,
  target:
    AuditDisplayParty
) {
  const label =
    target.label;

  switch (
    event.action
  ) {
    case "people.access_changed":
      return "Access was updated for " + label + ".";

    case "people.deactivated":
      return label + " was deactivated.";

    case "people.reactivated":
      return label + " was reactivated.";

    case "people.deleted":
      return label + " was permanently deleted.";

    case "invite.created":
      return "An invitation was sent to " + label + ".";

    case "invite.resent":
      return "A new invitation was sent to " + label + ".";

    case "invite.accepted":
      return label + " completed account setup.";

    case "two_factor.reset":
      return "Two-factor authentication was reset for " + label + ".";

    case "model.created":
      return label + " was added to Creator Management.";

    case "model.renamed":
      return label + " was renamed.";

    case "model.deactivated":
      return label + " was deactivated.";

    case "model.reactivated":
      return label + " was reactivated.";

    case "role.created":
      return label + " was created.";

    case "role.updated":
      return label + " was updated.";

    case "role.deleted":
      return label + " was deleted.";

    case "auth.password_verified":
      return "The password for " + label + " was verified.";

    case "auth.sign_in_succeeded":
      return label + " completed sign-in.";

    case "auth.sign_in_failed":
      return "A sign-in attempt for " + label + " failed.";

    default:
      return actionLabel(
        event.action
      ) + " affected " + label + ".";
  }
}

export async function presentAuditEvents(
  events:
    AuditEvent[]
): Promise<
  PresentedAuditEvent[]
> {
  const userIds =
    new Set<
      string
    >();

  const roleIds =
    new Set<
      string
    >();

  const modelIds =
    new Set<
      string
    >();

  const chatterIds =
    new Set<
      string
    >();

  const incidentIds =
    new Set<
      string
    >();

  for (
    const event
    of events
  ) {
    if (
      event.actorUserId
    ) {
      userIds.add(
        event.actorUserId
      );
    }

    if (
      event.targetId
    ) {
      if (
        event.targetType ===
          "user"
      ) {
        userIds.add(
          event.targetId
        );
      } else if (
        event.targetType ===
          "role"
      ) {
        roleIds.add(
          event.targetId
        );
      } else if (
        event.targetType ===
          "model"
      ) {
        modelIds.add(
          event.targetId
        );
      } else if (
        event.targetType ===
          "chatter"
      ) {
        chatterIds.add(
          event.targetId
        );
      } else if (
        event.targetType ===
          "incident"
      ) {
        incidentIds.add(
          event.targetId
        );
      }
    }

    const metadata =
      asRecord(
        event.metadata
      );

    for (
      const value
      of [
        metadata?.before,
        metadata?.after,
        metadata?.requested,
      ]
    ) {
      const record =
        asRecord(
          value
        );

      collectSnapshotIds(
        record,
        roleIds,
        modelIds,
        userIds
      );
    }
  }

  const [
    users,
    roles,
    models,
    chatters,
    incidents,
  ] =
    await Promise.all([
      userIds.size
        ? prisma.user.findMany({
            where: {
              id: {
                in: [
                  ...userIds,
                ],
              },
            },
            select: {
              id:
                true,
              name:
                true,
              email:
                true,
            },
          })
        : [],
      roleIds.size
        ? prisma.role.findMany({
            where: {
              id: {
                in: [
                  ...roleIds,
                ],
              },
            },
            select: {
              id:
                true,
              name:
                true,
            },
          })
        : [],
      modelIds.size
        ? prisma.agencyModel.findMany({
            where: {
              id: {
                in: [
                  ...modelIds,
                ],
              },
            },
            select: {
              id:
                true,
              name:
                true,
            },
          })
        : [],
      chatterIds.size
        ? prisma.chatter.findMany({
            where: {
              id: {
                in: [
                  ...chatterIds,
                ],
              },
            },
            select: {
              id:
                true,
              name:
                true,
            },
          })
        : [],
      incidentIds.size
        ? prisma.incident.findMany({
            where: {
              id: {
                in: [
                  ...incidentIds,
                ],
              },
            },
            select: {
              id:
                true,
              ruleTitleSnapshot:
                true,
              chatter: {
                select: {
                  name:
                    true,
                },
              },
            },
          })
        : [],
    ]);

  const userMap =
    new Map(
      users.map(
        (
          user
        ) => [
          user.id,
          user,
        ] as const
      )
    );

  const roleMap =
    new Map(
      roles.map(
        (
          role
        ) => [
          role.id,
          role.name,
        ] as const
      )
    );

  const modelMap =
    new Map(
      models.map(
        (
          model
        ) => [
          model.id,
          model.name,
        ] as const
      )
    );

  const chatterMap =
    new Map(
      chatters.map(
        (
          chatter
        ) => [
          chatter.id,
          chatter.name,
        ] as const
      )
    );

  const incidentMap =
    new Map(
      incidents.map(
        (
          incident
        ) => [
          incident.id,
          incident.chatter.name +
            " · " +
            incident.ruleTitleSnapshot,
        ] as const
      )
    );

  return events.map(
    (
      event
    ) => {
      const metadata =
        asRecord(
          event.metadata
        );

      const before =
        asRecord(
          metadata?.before
        );

      const after =
        asRecord(
          metadata?.after
        );

      const actorUser =
        event.actorUserId
          ? userMap.get(
              event.actorUserId
            )
          : undefined;

      const actor:
        AuditDisplayParty =
        actorUser
          ? {
              label:
                actorUser.name,
              secondary:
                actorUser.email,
              kind:
                "person",
            }
          : event.actorLabel
            ? {
                label:
                  event.actorLabel,
                secondary:
                  null,
                kind:
                  "person",
              }
            : {
                label:
                  "System",
                secondary:
                  null,
                kind:
                  "system",
              };

      let target:
        AuditDisplayParty;

      if (
        event.targetType ===
          "user"
      ) {
        const snapshot =
          after ??
          before;

        const snapshotId =
          asString(
            snapshot?.id
          );

        const user =
          event.targetId
            ? userMap.get(
                event.targetId
              )
            : snapshotId
              ? userMap.get(
                  snapshotId
                )
              : undefined;

        target =
          user
            ? {
                label:
                  user.name,
                secondary:
                  user.email,
                kind:
                  "person",
              }
            : {
                label:
                  snapshotName(
                    snapshot
                  ) ??
                  event.actorLabel ??
                  "User account",
                secondary:
                  asString(
                    snapshot?.email
                  ),
                kind:
                  "person",
              };
      } else if (
        event.targetType ===
          "model"
      ) {
        target = {
          label:
            (
              event.targetId
                ? modelMap.get(
                    event.targetId
                  )
                : null
            ) ??
            snapshotName(
              after ??
              before
            ) ??
            "Creator",
          secondary:
            null,
          kind:
            "creator",
        };
      } else if (
        event.targetType ===
          "role"
      ) {
        target = {
          label:
            (
              event.targetId
                ? roleMap.get(
                    event.targetId
                  )
                : null
            ) ??
            snapshotName(
              after ??
              before
            ) ??
            "Role",
          secondary:
            null,
          kind:
            "role",
        };
      } else if (
        event.targetType ===
          "chatter"
      ) {
        target = {
          label:
            (
              event.targetId
                ? chatterMap.get(
                    event.targetId
                  )
                : null
            ) ??
            "Chatter",
          secondary:
            null,
          kind:
            "chatter",
        };
      } else if (
        event.targetType ===
          "incident"
      ) {
        target = {
          label:
            (
              event.targetId
                ? incidentMap.get(
                    event.targetId
                  )
                : null
            ) ??
            "Incident",
          secondary:
            null,
          kind:
            "incident",
        };
      } else if (
        event.targetType ===
          "invite"
      ) {
        target = {
          label:
            event.actorLabel ??
            "Account invitation",
          secondary:
            null,
          kind:
            "invitation",
        };
      } else {
        target = {
          label:
            event.targetType
              ? humanize(
                  event.targetType
                )
              : "No specific target",
          secondary:
            null,
          kind:
            event.targetType,
        };
      }

      const changes =
        buildChanges(
          event,
          roleMap,
          modelMap
        );

      return {
        id:
          event.id,
        occurredAt:
          event.occurredAt,
        action:
          event.action,
        actionLabel:
          actionLabel(
            event.action
          ),
        success:
          event.success,
        statusCode:
          event.statusCode,
        actor,
        target,
        summary:
          event.success
            ? buildSummary(
                event,
                target
              )
            : actionLabel(
                event.action
              ) + " was not completed.",
        changes,
        source: {
          ipAddress:
            event.ipAddress,
          deviceLabel:
            formatDeviceLabel(
              event.userAgent
            ),
        },
      };
    }
  );
}
