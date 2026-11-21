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
  retainedChannelId?: string;
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
    "chat.message.send": "Chat message sent",
    "chat.attachment.download": "Chat attachment download started",
    "chat.attachment.play": "Chat voice message playback requested",
    "chat.message.edit": "Chat message edited",
    "chat.message.delete": "Chat message deleted (retained for Owners)",
    "chat.moderation_defaults.install": "Chat moderation defaults installed",
    "chat.message.pin": "Chat message pinned",
    "chat.message.unpin": "Chat message unpinned",
    "chat.reaction.add": "Chat reaction added",
    "chat.reaction.remove": "Chat reaction removed",
    "chat.interaction_defaults.install": "Chat interaction defaults installed",
    "chat.channel.create": "Chat channel created",
    "chat.channel.rename": "Chat channel renamed",
    "chat.channel.archive": "Chat channel archived",
    "chat.channel.export.start": "Chat archive export started",
    "chat.channel.export.download": "Chat archive download completed on server",
    "chat.channel.cleanup": "Archived Chat channel cleaned up",
    "chat.channel.grant": "Chat channel access updated",
    "chat.private.create": "Private chat created",
    "chat.private.archive": "Private chat archived",
    "chat.unread_reminder.email": "Unread reminder email",
    "chat.email.review_resolve": "Paused email delivery resolved",
    "clock.correction.request": "Attendance correction requested",
    "clock.correction.approve": "Attendance correction approved",
    "clock.correction.reject": "Attendance correction rejected",
    "clock.correction.withdraw": "Attendance correction cancelled",
    "clock.correction_defaults.install": "Attendance correction defaults installed",
    "clock.in": "Clocked in",
    "clock.out": "Clocked out",
    "clock.break.start": "Paid break started",
    "clock.break.end": "Paid break ended",
    "clock.break.auto_end": "Paid break ended at its limit",
    "clock.break.reminder": "Paid break reminder recorded",
    "clock.break.limit_flag": "Automatic break end flagged",
    "clock.shift.flag": "Open shift flagged at 14 hours",
    "clock.alert_defaults.install": "Attendance alert defaults installed",
    "clock.defaults.install": "Clock defaults installed",
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
    "people.group_changed":
      "Team group changed",
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
    "team_group.created":
      "Team group created",
    "team_group.updated":
      "Team group updated",
    "team_group.deleted":
      "Team group deleted",
    "qa.severity.created":
      "Severity created",
    "qa.severity.updated":
      "Severity updated",
    "qa.severity.archived":
      "Severity archived",
    "qa.severity.reactivated":
      "Severity reactivated",
    "qa.severity.reordered":
      "Severity order updated",
    "qa.weight.created":
      "Strike weight created",
    "qa.weight.updated":
      "Strike weight updated",
    "qa.weight.archived":
      "Strike weight archived",
    "qa.weight.reactivated":
      "Strike weight reactivated",
    "qa.weight.reordered":
      "Strike weight order updated",
    "qa.rule.created":
      "QA rule created",
    "qa.rule.version_created":
      "QA rule version created",
    "qa.rule.archived":
      "QA rule archived",
    "qa.rule.reactivated":
      "QA rule reactivated",
    "qa.strike_ladder.version_created":
      "Strike ladder version created",
    "strike.issued":
      "Strike issued",
    "strike.voided":
      "Strike voided",
    "strike.reason.created":
      "Strike reason created",
    "strike.reason.updated":
      "Strike reason updated",
    "strike.reason.archived":
      "Strike reason archived",
    "strike.reason.reactivated":
      "Strike reason reactivated",
    "strike.ladder.version_created":
      "Strike ladder version created",
    "qa.incident.logged":
      "Incident logged",
    "qa.incident.updated":
      "Incident updated",
    "qa.incident.resolved":
      "Incident resolved",
    "qa.incident.voided":
      "Incident voided",
    "qa.chatter.created":
      "Chatter created",
    "qa.chatter.updated":
      "Chatter updated",
    "qa.chatter.deactivated":
      "Chatter deactivated",
    "qa.chatter.reactivated":
      "Chatter reactivated",
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
    Set<string>,
  teamGroupIds:
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

  const teamGroupId =
    asString(
      record.teamGroupId
    );

  if (
    teamGroupId
  ) {
    teamGroupIds.add(
      teamGroupId
    );
  }

  const parentId =
    asString(
      record.parentId
    );

  if (
    parentId
  ) {
    teamGroupIds.add(
      parentId
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
    >,
  teamGroupNames:
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

  if (event.targetType === "clock") {
    pushChange(changes, "Clock-in time (UTC)", null, asString(metadata?.startedAt));
    pushChange(changes, "End time (UTC)", null, asString(metadata?.endedAt));
    const breakLabels: Record<string, string> = { SHORT_ONE: "Short break 1", SHORT_TWO: "Short break 2", MEAL: "Meal break" };
    const breakKind = asString(metadata?.kind);
    pushChange(changes, "Paid break", null, breakKind ? breakLabels[breakKind] ?? breakKind : null);
    if (typeof metadata?.workedSeconds === "number") pushChange(changes, "Worked seconds (paid breaks included)", null, String(metadata.workedSeconds));
    pushChange(changes, "Due time (UTC)", null, asString(metadata?.dueAt));
    pushChange(changes, "Recorded time (UTC)", null, asString(metadata?.recordedAt));
    pushChange(changes, "Reason", null, asString(metadata?.reason));
    if (event.action.startsWith("clock.correction.")) {
      const before = asRecord(metadata?.before), after = asRecord(metadata?.after);
      pushChange(changes, "Recorded / requested clock-in (UTC)", asString(before?.startedAt), asString(after?.startedAt));
      pushChange(changes, "Recorded / requested clock-out (UTC)", asString(before?.endedAt), asString(after?.endedAt));
      pushChange(changes, "Review note", null, asString(metadata?.reviewNote));
      const previousBreaks = Array.isArray(before?.breaks) ? before.breaks.map(asRecord) : [];
      const nextBreaks = Array.isArray(after?.breaks) ? after.breaks.map(asRecord) : [];
      for (const pause of nextBreaks) {
        const kind = asString(pause?.kind);
        const previous = previousBreaks.find((b) => asString(b?.kind) === kind);
        const label = kind ? breakLabels[kind] ?? kind : "Paid break";
        pushChange(changes, `${label} start (UTC)`, asString(previous?.startedAt), asString(pause?.startedAt));
        pushChange(changes, `${label} end (UTC)`, asString(previous?.endedAt), asString(pause?.endedAt));
      }
    }
    return changes;
  }

  if (event.targetType === "chat") {
    if (event.action === "chat.message.delete") {
      pushChange(changes, "Retained message text", asString(metadata?.text), "Deleted from normal conversations");
      pushChange(changes, "Reason", null, asString(metadata?.reason));
      pushChange(changes, "Original author", null, asString(metadata?.authorName));
    }
    if (["chat.message.pin", "chat.message.unpin"].includes(event.action)) pushChange(changes, "Message text", null, asString(metadata?.text));
    if (["chat.reaction.add", "chat.reaction.remove"].includes(event.action)) pushChange(changes, "Reaction", null, asString(metadata?.emoji));
    if (event.action === "chat.message.send") pushChange(changes, "Message text", null, asString(metadata?.text));
    if (["chat.message.send", "chat.attachment.download", "chat.attachment.play"].includes(event.action)) {
      pushChange(changes, "Attachment", null, asString(metadata?.fileName));
    }
    if (["chat.channel.export.start", "chat.channel.export.download", "chat.channel.cleanup"].includes(event.action)) {
      pushChange(changes, "Archive file", null, asString(metadata?.fileName));
    }
    if (event.action === "chat.message.edit") pushChange(changes, "Message text", asString(metadata?.before), asString(metadata?.after));
    if (event.action === "chat.channel.rename") pushChange(changes, "Channel name", asString(metadata?.before), asString(metadata?.after));
    if (event.action === "chat.private.archive") pushChange(changes, "Archive reason", null, asString(metadata?.reason));
    if (event.action === "chat.unread_reminder.email") {
      // Recipient, count and outcome only: reminder emails carry no message content.
      pushChange(changes, "Recipient", null, asString(metadata?.personName));
      const unread = asNumber(metadata?.unreadCount);
      pushChange(changes, "Unread messages", null, unread === null ? null : String(unread));
      pushChange(changes, "Outcome", null, asString(metadata?.outcome));
    }
    if (event.action === "chat.email.review_resolve") {
      pushChange(changes, "Email", null, asString(metadata?.kind));
      pushChange(changes, "Recipient", null, asString(metadata?.personName));
      pushChange(changes, "Announcement", null, asString(metadata?.title));
    }
    if (event.action === "chat.channel.grant") {
      const describe = (value: unknown) => { const grant = asRecord(value); return grant?.canPost ? "See and post" : grant?.canView ? "See only" : "No direct grant"; };
      pushChange(changes, asString(metadata?.recipientName) ?? "Channel access", describe(metadata?.beforeGrant), describe(metadata?.afterGrant));
    }
    return changes;
  }

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

      const beforeGroupId =
        asString(
          before.teamGroupId
        );

      const afterGroupId =
        asString(
          after.teamGroupId
        );

      pushChange(
        changes,
        "Team group",
        asString(
          before.teamGroupName
        ) ??
          (
            beforeGroupId
              ? teamGroupNames.get(
                  beforeGroupId
                ) ??
                "Unavailable"
              : null
          ),
        asString(
          after.teamGroupName
        ) ??
          (
            afterGroupId
              ? teamGroupNames.get(
                  afterGroupId
                ) ??
                "Unavailable"
              : null
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

    if (after && "creatorProfile" in after) {
      pushChange(
        changes,
        "Creator profile",
        snapshotName(asRecord(before?.creatorProfile)),
        snapshotName(asRecord(after.creatorProfile)),
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
      "team_group"
  ) {
    pushChange(
      changes,
      "Group name",
      asString(
        before?.name
      ),
      asString(
        after?.name
      )
    );

    const beforeParentId =
      asString(
        before?.parentId
      );

    const afterParentId =
      asString(
        after?.parentId
      );

    pushChange(
      changes,
      "Parent group",
      beforeParentId
        ? teamGroupNames.get(
            beforeParentId
          ) ??
          "Unavailable"
        : null,
      afterParentId
        ? teamGroupNames.get(
            afterParentId
          ) ??
          "Unavailable"
        : null
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

    case "people.group_changed":
      return label + " was moved to a different team group.";

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

    case "team_group.created":
      return label + " was added to the organization hierarchy.";

    case "team_group.updated":
      return label + " was updated.";

    case "team_group.deleted":
      return label + " was removed from the organization hierarchy.";

    case "auth.password_verified":
      return "The password for " + label + " was verified.";

    case "auth.sign_in_succeeded":
      return label + " completed sign-in.";

    case "auth.sign_in_failed":
      return "A sign-in attempt for " + label + " failed.";

    case "chat.unread_reminder.email": {
      const details = asRecord(event.metadata);
      const unread = asNumber(details?.unreadCount);
      return ["To " + label, unread === null ? null : unread + " unread", asString(details?.outcome)].filter(Boolean).join(" · ");
    }

    case "chat.email.review_resolve":
      return asString(asRecord(event.metadata)?.kind) === "Announcement email"
        ? "Announcement email for " + label + " marked handled."
        : "Reminder emails resumed for " + label + ".";

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

  const teamGroupIds =
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
      } else if (
        event.targetType ===
          "team_group"
      ) {
        teamGroupIds.add(
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
        userIds,
        teamGroupIds
      );
    }
  }

  const [
    users,
    roles,
    models,
    chatters,
    incidents,
    teamGroups,
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
      teamGroupIds.size
        ? prisma.teamGroup.findMany({
            where: {
              id: {
                in: [
                  ...teamGroupIds,
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

  const teamGroupMap =
    new Map(
      teamGroups.map(
        (
          group
        ) => [
          group.id,
          group.name,
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
          "team_group"
      ) {
        target = {
          label:
            (
              event.targetId
                ? teamGroupMap.get(
                    event.targetId
                  )
                : null
            ) ??
            snapshotName(
              after ??
              before
            ) ??
            "Team group",
          secondary:
            null,
          kind:
            "team group",
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
      } else if (event.targetType === "chat") {
        // Email delivery records affect a person, not a channel.
        const emailPerson = ["chat.unread_reminder.email", "chat.email.review_resolve"].includes(event.action) ? asString(metadata?.personName) : null;
        target = { label: emailPerson ?? asString(metadata?.channelName) ?? "Chat", secondary: null, kind: "chat" };
      } else if (event.targetType === "clock") {
        target = { label: asString(metadata?.personName) ?? event.actorLabel ?? "Attendance", secondary: null, kind: "clock" };
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
          modelMap,
          teamGroupMap
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
        ...(event.success && event.action === "chat.channel.cleanup" && event.targetType === "chat" && event.targetId
          ? { retainedChannelId: event.targetId } : {}),
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
