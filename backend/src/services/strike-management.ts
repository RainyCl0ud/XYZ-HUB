import {
  Prisma,
  RoleDataScope,
  UserStatus,
} from "@prisma/client";

import {
  prisma,
} from "../lib/prisma.js";

import {
  canAccessModel,
  hasPermission,
  isOwner,
  type AccessContext,
} from "./access-control.js";

import {
  canAccessTeamGroup,
} from "./team-hierarchy.js";

import {
  calculateExpiryDate,
  getCurrentStrikeLadder,
  getStrikeLadderState,
} from "./strike-ladder.js";

export type StrikeStatus =
  | "ACTIVE"
  | "EXPIRED"
  | "VOIDED";

export type StrikeManagementErrorCode =
  | "STRIKES_VIEW_REQUIRED"
  | "STRIKES_ISSUE_REQUIRED"
  | "STRIKES_VOID_REQUIRED"
  | "USER_NOT_FOUND"
  | "TARGET_NOT_ELIGIBLE"
  | "TARGET_NOT_MANAGEABLE"
  | "CANNOT_STRIKE_SELF"
  | "REASON_NOT_FOUND"
  | "REASON_INACTIVE"
  | "STRIKE_NOT_FOUND"
  | "STRIKE_NOT_MANAGEABLE"
  | "STRIKE_ALREADY_VOIDED"
  | "SOURCE_INCIDENT_NOT_FOUND"
  | "SOURCE_INCIDENT_TARGET_MISMATCH"
  | "SOURCE_INCIDENT_NOT_ELIGIBLE"
  | "SOURCE_INCIDENT_ALREADY_LINKED";

export class StrikeManagementError
  extends Error {
  readonly code:
    StrikeManagementErrorCode;

  constructor(
    code:
      StrikeManagementErrorCode,
    message:
      string
  ) {
    super(
      message
    );

    this.name =
      "StrikeManagementError";

    this.code =
      code;
  }
}

const strikeTargetSelect = {
  id: true,
  name: true,
  email: true,
  status: true,
  teamGroupId: true,

  roleMemberships: {
    select: {
      role: {
        select: {
          systemKey:
            true,
          rank:
            true,
        },
      },
    },
  },

  modelAssignments: {
    select: {
      modelId:
        true,
    },
  },
} satisfies Prisma.UserSelect;

type StrikeTargetRecord =
  Prisma.UserGetPayload<{
    select:
      typeof strikeTargetSelect;
  }>;

const strikeInclude = {
  user: {
    select:
      strikeTargetSelect,
  },

  reason: {
    select: {
      id: true,
      name: true,
      isActive: true,
    },
  },

  ladderVersion: {
    select: {
      id: true,
      versionNumber: true,
      durationDays: true,
    },
  },
} satisfies Prisma.StrikeInclude;

type StrikeRecord =
  Prisma.StrikeGetPayload<{
    include:
      typeof strikeInclude;
  }>;

function isOpsManager(
  access:
    AccessContext
) {
  return access.roles.some(
    (role) =>
      role.systemKey ===
      "OPS_MANAGER"
  );
}

function hasOwnerRole(
  target:
    StrikeTargetRecord
) {
  return target
    .roleMemberships
    .some(
      (membership) =>
        membership.role
          .systemKey ===
        "OWNER"
    );
}

function hasEligibleStrikeRole(
  target:
    StrikeTargetRecord
) {
  return target
    .roleMemberships
    .some(
      (membership) =>
        membership.role
          .systemKey ===
          "CHATTER" ||
        membership.role
          .systemKey ===
          "TRIAL_CHATTER"
    );
}

function assertPermission(
  access:
    AccessContext,
  permission:
    string,
  code:
    StrikeManagementErrorCode
) {
  if (
    !hasPermission(
      access,
      permission
    )
  ) {
    throw new StrikeManagementError(
      code,
      "You do not have permission to perform this Strike action."
    );
  }
}

function assertViewAccess(
  access:
    AccessContext
) {
  assertPermission(
    access,
    "strikes.view",
    "STRIKES_VIEW_REQUIRED"
  );
}

function assertIssueAccess(
  access:
    AccessContext
) {
  assertPermission(
    access,
    "strikes.issue",
    "STRIKES_ISSUE_REQUIRED"
  );
}

function assertVoidAccess(
  access:
    AccessContext
) {
  assertPermission(
    access,
    "strikes.void",
    "STRIKES_VOID_REQUIRED"
  );
}

async function loadStrikeTarget(
  userId:
    string
) {
  return prisma.user.findUnique({
    where: {
      id:
        userId,
    },

    select:
      strikeTargetSelect,
  });
}

async function canViewTarget(
  access:
    AccessContext,
  target:
    StrikeTargetRecord
) {
  /*
   * Owner is never an ordinary disciplinary target.
   */
  if (
    hasOwnerRole(
      target
    )
  ) {
    return false;
  }

  /*
   * SELF data scope must never expose peers who merely
   * happen to belong to the same organization group.
   */
  if (
    access.effectiveDataScope ===
      RoleDataScope.SELF &&
    target.id !==
      access.userId
  ) {
    return false;
  }

  if (
    target.teamGroupId
  ) {
    if (
      !await canAccessTeamGroup(
        access,
        target.teamGroupId
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
     * Fail closed on malformed/legacy ungrouped users.
     */
    return false;
  }

  /*
   * Owner and Ops Manager have agency-wide management
   * authority once the protected Owner account itself
   * has been excluded.
   */
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
   * Self visibility is allowed only when the user was
   * deliberately granted strikes.view.
   */
  if (
    target.id ===
    access.userId
  ) {
    return target
      .modelAssignments
      .every(
        (assignment) =>
          canAccessModel(
            access,
            assignment.modelId
          )
      );
  }

  /*
   * Unranked callers cannot use a delegated Strike
   * permission to inspect arbitrary ranked employees.
   */
  if (
    access.highestRank ===
    null
  ) {
    return false;
  }

  if (
    target
      .roleMemberships
      .length ===
    0
  ) {
    return false;
  }

  /*
   * Non-Owner management may only see employees whose
   * current roles all sit below their own authority.
   *
   * Unranked target roles remain Owner-only.
   */
  const ranksVisible =
    target
      .roleMemberships
      .every(
        (membership) =>
          membership.role.rank !==
            null &&
          membership.role.rank >
            access.highestRank!
      );

  if (
    !ranksVisible
  ) {
    return false;
  }

  /*
   * Existing creator/model boundaries still apply.
   */
  return target
    .modelAssignments
    .every(
      (assignment) =>
        canAccessModel(
          access,
          assignment.modelId
        )
    );
}

async function canManageTarget(
  access:
    AccessContext,
  target:
    StrikeTargetRecord
) {
  if (
    target.id ===
    access.userId
  ) {
    return false;
  }

  if (
    !await canViewTarget(
      access,
      target
    )
  ) {
    return false;
  }

  /*
   * Owner has protected agency-wide disciplinary authority
   * over every eligible non-Owner employee.
   *
   * This explicit exception is important because unranked
   * secondary roles are intentionally not assignable through
   * the ordinary ranked-role helper.
   */
  if (
    isOwner(
      access
    )
  ) {
    return true;
  }

  /*
   * Strike authority is intentionally independent from
   * People role-assignment authority.
   *
   * The caller must already hold the relevant Strike
   * permission (strikes.issue / strikes.void), while
   * canViewTarget above enforces team hierarchy, rank,
   * data scope, Owner protection, and model access.
   *
   * Requiring People role-management permission here would incorrectly block
   * QC users who are explicitly authorized to issue
   * disciplinary Strikes.
   */
  return target
    .modelAssignments
    .every(
      (assignment) =>
        canAccessModel(
          access,
          assignment.modelId
        )
    );
}

function assertEligibleTarget(
  target:
    StrikeTargetRecord
) {
  if (
    target.status !==
    UserStatus.ACTIVE
  ) {
    throw new StrikeManagementError(
      "TARGET_NOT_ELIGIBLE",
      "Only active employees may receive a Strike."
    );
  }

  if (
    !hasEligibleStrikeRole(
      target
    )
  ) {
    throw new StrikeManagementError(
      "TARGET_NOT_ELIGIBLE",
      "Only Chatter or Trial Chatter employees may receive a Strike."
    );
  }
}

async function requireManageableTarget(
  userId:
    string,
  access:
    AccessContext
) {
  if (
    userId ===
    access.userId
  ) {
    throw new StrikeManagementError(
      "CANNOT_STRIKE_SELF",
      "You cannot issue or manage a Strike against your own account."
    );
  }

  const target =
    await loadStrikeTarget(
      userId
    );

  if (
    !target
  ) {
    throw new StrikeManagementError(
      "USER_NOT_FOUND",
      "The selected employee does not exist."
    );
  }

  assertEligibleTarget(
    target
  );

  if (
    !await canManageTarget(
      access,
      target
    )
  ) {
    throw new StrikeManagementError(
      "TARGET_NOT_MANAGEABLE",
      "You are not allowed to manage disciplinary actions for this employee."
    );
  }

  return target;
}

async function loadActorName(
  userId:
    string
) {
  const actor =
    await prisma.user.findUnique({
      where: {
        id:
          userId,
      },

      select: {
        name:
          true,
      },
    });

  if (
    !actor
  ) {
    throw new Error(
      "Authenticated Strike actor no longer exists."
    );
  }

  return actor.name;
}

export function deriveStrikeStatus(
  strike: {
    expiresAt:
      Date;

    voidedAt:
      Date | null;
  },
  now =
    new Date()
): StrikeStatus {
  if (
    strike.voidedAt
  ) {
    return "VOIDED";
  }

  if (
    strike.expiresAt.getTime() <=
    now.getTime()
  ) {
    return "EXPIRED";
  }

  return "ACTIVE";
}

function serializeStrike(
  strike:
    StrikeRecord,
  now =
    new Date()
) {
  return {
    id:
      strike.id,

    status:
      deriveStrikeStatus(
        strike,
        now
      ),

    userId:
      strike.userId,

    userNameSnapshot:
      strike.userNameSnapshot,

    userEmailSnapshot:
      strike.userEmailSnapshot,

    currentUser:
      strike.user
        ? {
            id:
              strike.user.id,
            name:
              strike.user.name,
            email:
              strike.user.email,
            status:
              strike.user.status,
          }
        : null,

    issuedByUserId:
      strike.issuedByUserId,

    issuedByNameSnapshot:
      strike.issuedByNameSnapshot,

    reasonId:
      strike.reasonId,

    reasonNameSnapshot:
      strike.reasonNameSnapshot,

    reasonDescriptionSnapshot:
      strike.reasonDescriptionSnapshot,

    details:
      strike.details,

    evidenceUrl:
      strike.evidenceUrl,


    sourceIncidentId:
      strike.sourceIncidentId,

    issuedAt:
      strike.issuedAt,

    expiresAt:
      strike.expiresAt,

    ladderVersionId:
      strike.ladderVersionId,

    ladderVersion:
      strike.ladderVersion
        .versionNumber,

    activeStrikeCountAfterIssue:
      strike.activeStrikeCountAfterIssue,

    standingLabelSnapshot:
      strike.standingLabelSnapshot,

    deductionPercentSnapshot:
      strike.deductionPercentSnapshot,

    voidedAt:
      strike.voidedAt,

    voidedByUserId:
      strike.voidedByUserId,

    voidedByNameSnapshot:
      strike.voidedByNameSnapshot,

    voidReason:
      strike.voidReason,

    createdAt:
      strike.createdAt,

    updatedAt:
      strike.updatedAt,
  };
}

// This helper is used only by canViewStrikeRecord and listStrikeHistoryForUser.
// Issue/preview/void and eligible-user selection retain canManageTarget and
// the original canViewTarget, neither of which calls this read exception.
async function canReadRelatedCreatorTarget(
  access: AccessContext,
  target: StrikeTargetRecord
) {
  if (
    access.effectiveDataScope !== RoleDataScope.SELF_AND_TEAM ||
    !access.teamGroupId || !target.teamGroupId ||
    hasOwnerRole(target) || !hasEligibleStrikeRole(target) ||
    access.highestRank === null || target.roleMemberships.length === 0 ||
    !target.roleMemberships.every(({ role }) =>
      role.rank !== null && role.rank > access.highestRank!
    ) ||
    access.assignedModelIds.length !== 1 ||
    target.modelAssignments.length !== 1 ||
    access.assignedModelIds[0] !== target.modelAssignments[0]!.modelId
  ) {
    return false;
  }

  // Require explicit single-creator assignments plus the same local team:
  // sibling role groups, or a target directly in the reviewer's immediate
  // parent team. This never walks to grandparents or unrelated branches.
  // Shared staff keep their original employee-wide history boundary.
  const groups = await prisma.teamGroup.findMany({
    where: { id: { in: [access.teamGroupId, target.teamGroupId] } },
    select: { id: true, parentId: true },
  });
  const reviewerGroup = groups.find((group) => group.id === access.teamGroupId);
  const targetGroup = groups.find((group) => group.id === target.teamGroupId);
  return Boolean(reviewerGroup?.parentId && targetGroup && (
    reviewerGroup.parentId === targetGroup.parentId ||
    reviewerGroup.parentId === targetGroup.id
  ));
}

async function canViewStrikeRecord(
  strike:
    StrikeRecord,
  access:
    AccessContext
) {
  /*
   * Deleted users leave the historical Strike record behind.
   *
   * Without a live organization identity there is no safe
   * subordinate scope to evaluate, so fail closed except for
   * agency-wide Owner/Ops management.
   */
  if (
    !strike.user
  ) {
    return (
      isOwner(
        access
      ) ||
      isOpsManager(
        access
      )
    );
  }

  return await canViewTarget(access, strike.user) ||
    await canReadRelatedCreatorTarget(access, strike.user);
}

export async function listStrikes(
  access:
    AccessContext
) {
  assertViewAccess(
    access
  );

  const strikes =
    await prisma.strike.findMany({
      include:
        strikeInclude,

      orderBy: [
        {
          issuedAt:
            "desc",
        },
        {
          createdAt:
            "desc",
        },
        {
          id:
            "desc",
        },
      ],
    });

  const now =
    new Date();

  const visible = [];

  for (
    const strike
    of strikes
  ) {
    if (
      await canViewStrikeRecord(
        strike,
        access
      )
    ) {
      visible.push(
        serializeStrike(
          strike,
          now
        )
      );
    }
  }

  return visible;
}

export async function listStrikeHistoryForUser(
  userId:
    string,
  access:
    AccessContext,
  historyPage = 1,
  historyPageSize = 5
) {
  assertViewAccess(
    access
  );

  const target =
    await loadStrikeTarget(
      userId
    );

  if (
    !target ||
    !(await canViewTarget(access, target) ||
      await canReadRelatedCreatorTarget(access, target))
  ) {
    return null;
  }

  const safeHistoryPage =
    Math.max(
      1,
      Math.floor(
        historyPage
      )
    );

  const safeHistoryPageSize =
    Math.min(
      20,
      Math.max(
        1,
        Math.floor(
          historyPageSize
        )
      )
    );

  const total =
    await prisma.strike.count({
      where: {
        userId,
      },
    });

  const pageCount =
    Math.max(
      1,
      Math.ceil(
        total /
        safeHistoryPageSize
      )
    );

  const resolvedPage =
    Math.min(
      safeHistoryPage,
      pageCount
    );

  const strikes =
    await prisma.strike.findMany({
      where: {
        userId,
      },

      include:
        strikeInclude,

      orderBy: [
        {
          issuedAt:
            "desc",
        },
        {
          createdAt:
            "desc",
        },
        {
          id:
            "desc",
        },
      ],

      skip:
        (resolvedPage - 1) *
        safeHistoryPageSize,

      take:
        safeHistoryPageSize,
    });

  const now =
    new Date();

  return {
    records:
      strikes.map(
        (
          strike
        ) =>
          serializeStrike(
            strike,
            now
          )
      ),

    total,

    page:
      resolvedPage,

    pageSize:
      safeHistoryPageSize,

    pageCount,
  };
}


export async function getStrike(
  strikeId:
    string,
  access:
    AccessContext
) {
  assertViewAccess(
    access
  );

  const strike =
    await prisma.strike.findUnique({
      where: {
        id:
          strikeId,
      },

      include:
        strikeInclude,
    });

  if (
    !strike ||
    !await canViewStrikeRecord(
      strike,
      access
    )
  ) {
    throw new StrikeManagementError(
      "STRIKE_NOT_FOUND",
      "Strike record not found."
    );
  }

  return serializeStrike(
    strike
  );
}

export async function getStrikeBySourceIncident(
  sourceIncidentId:
    string,
  access:
    AccessContext
) {
  assertViewAccess(
    access
  );

  const strike =
    await prisma.strike.findUnique({
      where: {
        sourceIncidentId,
      },

      include:
        strikeInclude,
    });

  if (
    !strike ||
    !await canViewStrikeRecord(
      strike,
      access
    )
  ) {
    return null;
  }

  return serializeStrike(
    strike
  );
}
export async function listEligibleStrikeTargets(
  access:
    AccessContext
) {
  assertIssueAccess(
    access
  );

  const users =
    await prisma.user.findMany({
      where: {
        status:
          UserStatus.ACTIVE,
      },

      select:
        strikeTargetSelect,

      orderBy: {
        name:
          "asc",
      },
    });

  const eligible = [];

  for (
    const target
    of users
  ) {
    if (
      !hasEligibleStrikeRole(
        target
      ) ||
      hasOwnerRole(
        target
      )
    ) {
      continue;
    }

    if (
      await canManageTarget(
        access,
        target
      )
    ) {
      eligible.push({
        id:
          target.id,
        name:
          target.name,
        email:
          target.email,
      });
    }
  }

  return eligible;
}

export async function previewStrike(
  userId:
    string,
  access:
    AccessContext
) {
  assertIssueAccess(
    access
  );

  const target =
    await requireManageableTarget(
      userId,
      access
    );

  const issuedAt =
    new Date();

  const [
    ladder,
    activeStrikeCount,
  ] =
    await Promise.all([
      getCurrentStrikeLadder(),

      prisma.strike.count({
        where: {
          userId:
            target.id,

          voidedAt:
            null,

          expiresAt: {
            gt:
              issuedAt,
          },
        },
      }),
    ]);

  const activeStrikeCountAfterIssue =
    activeStrikeCount + 1;

  const standing =
    getStrikeLadderState(
      activeStrikeCountAfterIssue,
      ladder.steps
    );

  return {
    user: {
      id:
        target.id,
      name:
        target.name,
      email:
        target.email,
    },

    currentActiveStrikeCount:
      activeStrikeCount,

    activeStrikeCountAfterIssue,

    standingLabel:
      standing.standingLabel,

    deductionPercent:
      standing
        .commissionDeductionPercent,

    issuedAt,

    expiresAt:
      calculateExpiryDate(
        issuedAt,
        ladder.durationDays
      ),

    ladderVersionId:
      ladder.id,

    ladderVersion:
      ladder.versionNumber,

    durationDays:
      ladder.durationDays,
  };
}

export async function issueStrike(
  input: {
    userId:
      string;

    reasonId:
      string;

    details:
      string;

    evidenceUrl?:
      string | null;

    sourceIncidentId?:
      string | null;
  },
  access:
    AccessContext
) {
  assertIssueAccess(
    access
  );

  const target =
    await requireManageableTarget(
      input.userId,
      access
    );

  const reason =
    await prisma.strikeReason.findUnique({
      where: {
        id:
          input.reasonId,
      },
    });

  if (
    !reason
  ) {
    throw new StrikeManagementError(
      "REASON_NOT_FOUND",
      "The selected Strike reason does not exist."
    );
  }

  if (
    !reason.isActive
  ) {
    throw new StrikeManagementError(
      "REASON_INACTIVE",
      "The selected Strike reason is archived and cannot be used."
    );
  }

  const [
    ladder,
    actorName,
  ] =
    await Promise.all([
      getCurrentStrikeLadder(),

      loadActorName(
        access.userId
      ),
    ]);

  const issuedAt =
    new Date();

  const expiresAt =
    calculateExpiryDate(
      issuedAt,
      ladder.durationDays
    );

  let lastConflict:
    unknown = null;

  for (
    let attempt = 0;
    attempt < 3;
    attempt += 1
  ) {
    try {
      const created =
        await prisma.$transaction(
          async (
            tx
          ) => {
            /*
             * Serializable counting prevents two simultaneous
             * Strike issues from silently recording the same
             * "count after issue" snapshot.
             */
            /*
             * QA escalation is optional.
             *
             * A QA Incident remains a QA record.
             * sourceIncidentId only records which QA Incident
             * management deliberately used as the basis for
             * this Strike.
             */
            if (
              input.sourceIncidentId
            ) {
              const sourceIncident =
                await tx.incident.findUnique({
                  where: {
                    id:
                      input.sourceIncidentId,
                  },

                  select: {
                    id:
                      true,

                    modelId:
                      true,

                    status:
                      true,

                    chatter: {
                      select: {
                        userId:
                          true,
                      },
                    },
                  },
                });

              if (
                !sourceIncident ||
                (
                  sourceIncident.modelId !==
                    null &&
                  !canAccessModel(
                    access,
                    sourceIncident.modelId
                  )
                )
              ) {
                throw new StrikeManagementError(
                  "SOURCE_INCIDENT_NOT_FOUND",
                  "The selected QA Incident is unavailable."
                );
              }

              if (
                sourceIncident
                  .chatter
                  .userId !==
                target.id
              ) {
                throw new StrikeManagementError(
                  "SOURCE_INCIDENT_TARGET_MISMATCH",
                  "The selected QA Incident does not belong to this employee."
                );
              }

              if (
                sourceIncident.status ===
                "VOIDED"
              ) {
                throw new StrikeManagementError(
                  "SOURCE_INCIDENT_NOT_ELIGIBLE",
                  "A voided QA Incident cannot be used to issue a Strike."
                );
              }

              const existingLinkedStrike =
                await tx.strike.findUnique({
                  where: {
                    sourceIncidentId:
                      input.sourceIncidentId,
                  },

                  select: {
                    id:
                      true,
                  },
                });

              if (
                existingLinkedStrike
              ) {
                throw new StrikeManagementError(
                  "SOURCE_INCIDENT_ALREADY_LINKED",
                  "This QA Incident already has a linked Strike."
                );
              }
            }
            const activeStrikeCount =
              await tx.strike.count({
                where: {
                  userId:
                    target.id,

                  voidedAt:
                    null,

                  expiresAt: {
                    gt:
                      issuedAt,
                  },
                },
              });

            const activeStrikeCountAfterIssue =
              activeStrikeCount + 1;

            const standing =
              getStrikeLadderState(
                activeStrikeCountAfterIssue,
                ladder.steps
              );

            return tx.strike.create({
              data: {
                userId:
                  target.id,

                userNameSnapshot:
                  target.name,

                userEmailSnapshot:
                  target.email,

                issuedByUserId:
                  access.userId,

                issuedByNameSnapshot:
                  actorName,

                reasonId:
                  reason.id,

                reasonNameSnapshot:
                  reason.name,

                reasonDescriptionSnapshot:
                  reason.description,

                details:
                  input.details.trim(),

                evidenceUrl:
                  input.evidenceUrl
                    ?.trim() ||
                  null,


                sourceIncidentId:
                  input.sourceIncidentId
                    ?.trim() ||
                  null,

                issuedAt,
                expiresAt,

                ladderVersionId:
                  ladder.id,

                activeStrikeCountAfterIssue,

                standingLabelSnapshot:
                  standing
                    .standingLabel,

                deductionPercentSnapshot:
                  standing
                    .commissionDeductionPercent,
              },

              include:
                strikeInclude,
            });
          },
          {
            isolationLevel:
              Prisma
                .TransactionIsolationLevel
                .Serializable,
          }
        );

      return serializeStrike(
        created,
        issuedAt
      );
    } catch (
      error
    ) {
      if (
        error instanceof
          Prisma.PrismaClientKnownRequestError &&
        error.code ===
          "P2002" &&
        input.sourceIncidentId
      ) {
        throw new StrikeManagementError(
          "SOURCE_INCIDENT_ALREADY_LINKED",
          "This QA Incident already has a linked Strike."
        );
      }
      if (
        error instanceof
          Prisma.PrismaClientKnownRequestError &&
        error.code ===
          "P2034"
      ) {
        lastConflict =
          error;

        continue;
      }

      throw error;
    }
  }

  throw (
    lastConflict ??
    new Error(
      "Unable to issue Strike because of a concurrent update."
    )
  );
}

export async function voidStrike(
  strikeId:
    string,
  reason:
    string,
  access:
    AccessContext
) {
  assertVoidAccess(
    access
  );

  const trimmedReason =
    reason.trim();

  const strike =
    await prisma.strike.findUnique({
      where: {
        id:
          strikeId,
      },

      include:
        strikeInclude,
    });

  if (
    !strike
  ) {
    throw new StrikeManagementError(
      "STRIKE_NOT_FOUND",
      "Strike record not found."
    );
  }

  if (
    strike.voidedAt
  ) {
    throw new StrikeManagementError(
      "STRIKE_ALREADY_VOIDED",
      "This Strike has already been voided."
    );
  }

  if (
    !strike.user
  ) {
    if (
      !isOwner(
        access
      )
    ) {
      throw new StrikeManagementError(
        "STRIKE_NOT_MANAGEABLE",
        "Only an Owner may void a Strike whose employee record has been permanently deleted."
      );
    }
  } else if (
    !await canManageTarget(
      access,
      strike.user
    )
  ) {
    throw new StrikeManagementError(
      "STRIKE_NOT_MANAGEABLE",
      "You are not allowed to void this Strike."
    );
  }

  const actorName =
    await loadActorName(
      access.userId
    );

  const voidedAt =
    new Date();

  const update =
    await prisma.strike.updateMany({
      where: {
        id:
          strike.id,

        voidedAt:
          null,
      },

      data: {
        voidedAt,

        voidedByUserId:
          access.userId,

        voidedByNameSnapshot:
          actorName,

        voidReason:
          trimmedReason,
      },
    });

  if (
    update.count !==
    1
  ) {
    throw new StrikeManagementError(
      "STRIKE_ALREADY_VOIDED",
      "This Strike has already been voided."
    );
  }

  const updated =
    await prisma.strike.findUniqueOrThrow({
      where: {
        id:
          strike.id,
      },

      include:
        strikeInclude,
    });

  return serializeStrike(
    updated,
    voidedAt
  );
}
