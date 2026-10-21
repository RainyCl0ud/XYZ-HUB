import type {
  NextFunction,
  Response,
} from "express";

import {
  prisma,
} from "../lib/prisma.js";

import type {
  AuthenticatedRequest,
} from "./access.js";

import {
  appendAuditEvent,
} from "../services/audit-store.js";

import {
  hashInviteToken,
} from "../services/invite-token.js";

type RoleSnapshot = {
  id: string;
  name: string;
  systemKey: string | null;
  rank: number | null;
  dataScope: string;
  isSystem: boolean;
  permissions: string[];
  affectedUserCount: number;
};

type PersonAccessSnapshot = {
  id: string;
  name: string;
  email: string;
  status: string;
  teamGroupId: string | null;
  teamGroupName: string | null;
  roleIds: string[];
  roleNames: string[];
  modelIds: string[];
  modelNames: string[];
  creatorProfile: { id: string; name: string } | null;
};

type TeamGroupSnapshot = {
  id: string;
  name: string;
  parentId: string | null;
  isRoot: boolean;
  memberCount: number;
  childCount: number;
};

type ModelSnapshot = {
  id: string;
  name: string;
  isActive: boolean;
};

type AuditPreparation = {
  action: string;
  targetType: string | null;
  targetId: string | null;
  actorUserId: string | null;
  actorLabel: string | null;
  metadata: Record<string, unknown> | null;
  loadAfter?: () => Promise<unknown>;
};

function cleanPath(
  value:
    string
) {
  return value.split(
    "?",
    1
  )[0];
}

function segmentAfter(
  path:
    string,
  prefix:
    string
) {
  if (
    !path.startsWith(
      prefix
    )
  ) {
    return null;
  }

  return path
    .slice(
      prefix.length
    )
    .split(
      "/",
      1
    )[0] ||
    null;
}

async function getRoleSnapshot(
  roleId:
    string
): Promise<RoleSnapshot | null> {
  const role =
    await prisma.role.findUnique({
      where: {
        id:
          roleId,
      },

      select: {
        id:
          true,
        name:
          true,
        systemKey:
          true,
        rank:
          true,
        dataScope:
          true,
        isSystem:
          true,

        rolePermissions: {
          select: {
            permission: {
              select: {
                key:
                  true,
              },
            },
          },
        },

        _count: {
          select: {
            userRoles:
              true,
          },
        },
      },
    });

  if (
    !role
  ) {
    return null;
  }

  return {
    id:
      role.id,
    name:
      role.name,
    systemKey:
      role.systemKey,
    rank:
      role.rank,
    dataScope:
      role.dataScope,
    isSystem:
      role.isSystem,
    permissions:
      role.rolePermissions
        .map(
          (
            item
          ) =>
            item.permission
              .key
        )
        .sort(),
    affectedUserCount:
      role._count
        .userRoles,
  };
}

async function getPersonAccessSnapshot(
  userId:
    string
): Promise<PersonAccessSnapshot | null> {
  const user =
    await prisma.user.findUnique({
      where: {
        id:
          userId,
      },

      select: {
        id:
          true,
        name:
          true,
        email:
          true,
        status:
          true,

        teamGroupId:
          true,

        teamGroup: {
          select: {
            name:
              true,
          },
        },

        roleMemberships: {
          select: {
            roleId:
              true,

            role: {
              select: {
                name:
                  true,
              },
            },
          },
        },

        creatorProfile: { select: { id: true, name: true } },
        modelAssignments: {
          select: {
            modelId:
              true,

            model: {
              select: {
                name:
                  true,
              },
            },
          },
        },
      },
    });

  if (
    !user
  ) {
    return null;
  }

  return {
    id:
      user.id,
    name:
      user.name,
    email:
      user.email,
    status:
      user.status,
    teamGroupId:
      user.teamGroupId,
    teamGroupName:
      user.teamGroup
        ?.name ??
      null,
    roleIds:
      user.roleMemberships
        .map(
          (
            item
          ) =>
            item.roleId
        )
        .sort(),
    roleNames:
      user.roleMemberships
        .map(
          (
            item
          ) =>
            item.role.name
        )
        .sort(),
    creatorProfile: user.creatorProfile ?? null,
    modelIds:
      user.modelAssignments
        .map(
          (
            item
          ) =>
            item.modelId
        )
        .sort(),
    modelNames:
      user.modelAssignments
        .map(
          (
            item
          ) =>
            item.model.name
        )
        .sort(),
  };
}

async function getPersonByEmail(
  email:
    string
) {
  const user =
    await prisma.user.findFirst({
      where: {
        email: {
          equals:
            email
              .trim()
              .toLowerCase(),
          mode:
            "insensitive",
        },
      },

      select: {
        id:
          true,
      },
    });

  if (
    !user
  ) {
    return null;
  }

  return getPersonAccessSnapshot(
    user.id
  );
}

async function getTeamGroupSnapshot(
  groupId:
    string
): Promise<TeamGroupSnapshot | null> {
  const group =
    await prisma.teamGroup.findUnique({
      where: {
        id:
          groupId,
      },

      select: {
        id:
          true,

        name:
          true,

        parentId:
          true,

        isRoot:
          true,

        _count: {
          select: {
            members:
              true,

            children:
              true,
          },
        },
      },
    });

  if (
    !group
  ) {
    return null;
  }

  return {
    id:
      group.id,

    name:
      group.name,

    parentId:
      group.parentId,

    isRoot:
      group.isRoot,

    memberCount:
      group._count
        .members,

    childCount:
      group._count
        .children,
  };
}

async function getModelSnapshot(
  modelId:
    string
): Promise<ModelSnapshot | null> {
  return prisma.agencyModel.findUnique({
    where: {
      id:
        modelId,
    },

    select: {
      id:
        true,
      name:
        true,
      isActive:
        true,
    },
  });
}

async function getModelByName(
  name:
    string
) {
  return prisma.agencyModel.findFirst({
    where: {
      name: {
        equals:
          name.trim(),
        mode:
          "insensitive",
      },
    },

    select: {
      id:
        true,
      name:
        true,
      isActive:
        true,
    },
  });
}

async function prepareAudit(
  req:
    AuthenticatedRequest
): Promise<AuditPreparation | null> {
  const method =
    req.method.toUpperCase();

  const path =
    cleanPath(
      req.originalUrl
    );

  const base = {
    targetType:
      null,
    targetId:
      null,
    actorUserId:
      req.userId ??
      null,
    actorLabel:
      null,
    metadata:
      null,
  };

  if (
    path ===
      "/api/auth/login" &&
    method ===
      "POST"
  ) {
    return {
      ...base,
      action:
        "auth.sign_in_attempt",
      actorLabel:
        typeof req.body?.email ===
          "string"
          ? req.body.email
          : null,
      targetType:
        "user",
    };
  }

  if (
    path ===
      "/api/auth/verify-2fa" &&
    method ===
      "POST"
  ) {
    const challengeId =
      typeof req.body
        ?.challengeId ===
        "string"
        ? req.body.challengeId
        : null;

    let userId:
      string | null =
      null;

    if (
      challengeId
    ) {
      const challenge =
        await prisma
          .twoFactorChallenge
          .findUnique({
            where: {
              id:
                challengeId,
            },
            select: {
              userId:
                true,
            },
          });

      userId =
        challenge?.userId ??
        null;
    }

    return {
      ...base,
      action:
        "auth.two_factor_verification",
      actorUserId:
        userId,
      targetType:
        "user",
      targetId:
        userId,
    };
  }

  if (
    path ===
      "/api/people/invite" &&
    method ===
      "POST"
  ) {
    const email =
      typeof req.body
        ?.email ===
        "string"
        ? req.body.email
        : "";

    return {
      ...base,
      action:
        "invite.created",
      targetType:
        "user",
      metadata: {
        before:
          null,
        requested: {
          creatorModelId: typeof req.body?.creatorModelId === "string" ? req.body.creatorModelId : null,
          email:
            email ||
            null,
          roleIds:
            Array.isArray(
              req.body
                ?.roleIds
            )
              ? req.body
                  .roleIds
              : [],
          modelIds:
            Array.isArray(
              req.body
                ?.modelIds
            )
              ? req.body
                  .modelIds
              : [],
        },
      },
      ...(email
        ? {
            loadAfter:
              () =>
                getPersonByEmail(
                  email
                ),
          }
        : {}),
    };
  }

  if (
    path ===
      "/api/invites/accept" &&
    method ===
      "POST"
  ) {
    const token =
      typeof req.body
        ?.token ===
        "string"
        ? req.body.token
        : "";

    const invite =
      token
        ? await prisma.invite.findUnique({
            where: {
              tokenHash:
                hashInviteToken(
                  token
                ),
            },
            select: {
              userId:
                true,
            },
          })
        : null;

    const userId =
      invite?.userId ??
      null;

    const before =
      userId
        ? await getPersonAccessSnapshot(
            userId
          )
        : null;

    return {
      ...base,
      action:
        "invite.accepted",
      targetType:
        "user",
      targetId:
        userId,
      metadata: {
        before,
      },
      ...(userId
        ? {
            loadAfter:
              () =>
                getPersonAccessSnapshot(
                  userId
                ),
          }
        : {}),
    };
  }

  const peopleId =
    segmentAfter(
      path,
      "/api/people/"
    );

  if (
    peopleId
  ) {
    if (
      path.endsWith(
        "/resend-invite"
      ) &&
      method ===
        "POST"
    ) {
      return {
        ...base,
        action:
          "invite.resent",
        targetType:
          "user",
        targetId:
          peopleId,
      };
    }

    if (
      path.endsWith(
        "/deactivate"
      ) &&
      method ===
        "POST"
    ) {
      const before =
        await getPersonAccessSnapshot(
          peopleId
        );

      return {
        ...base,
        action:
          "people.deactivated",
        targetType:
          "user",
        targetId:
          peopleId,
        metadata: {
          before,
        },
        loadAfter:
          () =>
            getPersonAccessSnapshot(
              peopleId
            ),
      };
    }

    if (
      path.endsWith(
        "/reactivate"
      ) &&
      method ===
        "POST"
    ) {
      const before =
        await getPersonAccessSnapshot(
          peopleId
        );

      return {
        ...base,
        action:
          "people.reactivated",
        targetType:
          "user",
        targetId:
          peopleId,
        metadata: {
          before,
        },
        loadAfter:
          () =>
            getPersonAccessSnapshot(
              peopleId
            ),
      };
    }

    if (
      path.endsWith(
        "/reset-2fa"
      ) &&
      method ===
        "POST"
    ) {
      return {
        ...base,
        action:
          "two_factor.reset",
        targetType:
          "user",
        targetId:
          peopleId,
      };
    }

    if (
      path.endsWith(
        "/access"
      ) &&
      method ===
        "PUT"
    ) {
      const before =
        await getPersonAccessSnapshot(
          peopleId
        );

      return {
        ...base,
        action:
          "people.access_changed",
        targetType:
          "user",
        targetId:
          peopleId,
        metadata: {
          before,
          requested: {
            creatorModelId: typeof req.body?.creatorModelId === "string" ? req.body.creatorModelId : null,
            roleIds:
              Array.isArray(
                req.body
                  ?.roleIds
              )
                ? req.body
                    .roleIds
                : [],
            modelIds:
              Array.isArray(
                req.body
                  ?.modelIds
              )
                ? req.body
                    .modelIds
                : [],
          },
        },
        loadAfter:
          () =>
            getPersonAccessSnapshot(
              peopleId
            ),
      };
    }

    if (
      method ===
        "DELETE" &&
      path ===
        `/api/people/${peopleId}`
    ) {
      const before =
        await getPersonAccessSnapshot(
          peopleId
        );

      return {
        ...base,
        action:
          "people.deleted",
        targetType:
          "user",
        targetId:
          peopleId,
        metadata: {
          before,
          after:
            null,
        },
      };
    }
  }

  const modelId =
    segmentAfter(
      path,
      "/api/models/"
    );

  if (
    path ===
      "/api/models" &&
    method ===
      "POST"
  ) {
    const name =
      typeof req.body
        ?.name ===
        "string"
        ? req.body.name
        : "";

    return {
      ...base,
      action:
        "model.created",
      targetType:
        "model",
      metadata: {
        before:
          null,
        requestedName:
          name ||
          null,
      },
      ...(name
        ? {
            loadAfter:
              () =>
                getModelByName(
                  name
                ),
          }
        : {}),
    };
  }

  if (
    modelId
  ) {
    if (
      method ===
        "PUT"
    ) {
      const before =
        await getModelSnapshot(
          modelId
        );

      return {
        ...base,
        action:
          "model.renamed",
        targetType:
          "model",
        targetId:
          modelId,
        metadata: {
          before,
          requestedName:
            typeof req.body
              ?.name ===
              "string"
              ? req.body.name
              : null,
        },
        loadAfter:
          () =>
            getModelSnapshot(
              modelId
            ),
      };
    }

    if (
      path.endsWith(
        "/deactivate"
      ) &&
      method ===
        "POST"
    ) {
      const before =
        await getModelSnapshot(
          modelId
        );

      return {
        ...base,
        action:
          "model.deactivated",
        targetType:
          "model",
        targetId:
          modelId,
        metadata: {
          before,
        },
        loadAfter:
          () =>
            getModelSnapshot(
              modelId
            ),
      };
    }

    if (
      path.endsWith(
        "/reactivate"
      ) &&
      method ===
        "POST"
    ) {
      const before =
        await getModelSnapshot(
          modelId
        );

      return {
        ...base,
        action:
          "model.reactivated",
        targetType:
          "model",
        targetId:
          modelId,
        metadata: {
          before,
        },
        loadAfter:
          () =>
            getModelSnapshot(
              modelId
            ),
      };
    }
  }

  if (
    path ===
      "/api/team-groups" &&
    method ===
      "POST"
  ) {
    const name =
      typeof req.body
        ?.name ===
        "string"
        ? req.body.name
        : "";

    const parentGroupId =
      typeof req.body
        ?.parentGroupId ===
        "string"
        ? req.body.parentGroupId
        : null;

    return {
      ...base,
      action:
        "team_group.created",
      targetType:
        "team_group",
      metadata: {
        before:
          null,
        requested: {
          name:
            name ||
            null,
          parentGroupId,
        },
      },
      ...(name &&
      parentGroupId
        ? {
            loadAfter:
              async () => {
                const group =
                  await prisma.teamGroup.findFirst({
                    where: {
                      parentId:
                        parentGroupId,

                      name: {
                        equals:
                          name.trim(),
                        mode:
                          "insensitive",
                      },
                    },

                    select: {
                      id:
                        true,
                    },
                  });

                return group
                  ? getTeamGroupSnapshot(
                      group.id
                    )
                  : null;
              },
          }
        : {}),
    };
  }

  const teamMemberId =
    segmentAfter(
      path,
      "/api/team-groups/members/"
    );

  if (
    teamMemberId &&
    method ===
      "PUT"
  ) {
    const before =
      await getPersonAccessSnapshot(
        teamMemberId
      );

    return {
      ...base,
      action:
        "people.group_changed",
      targetType:
        "user",
      targetId:
        teamMemberId,
      metadata: {
        before,
        requested: {
          teamGroupId:
            typeof req.body
              ?.groupId ===
              "string"
              ? req.body
                  .groupId
              : null,
        },
      },
      loadAfter:
        () =>
          getPersonAccessSnapshot(
            teamMemberId
          ),
    };
  }

  const teamGroupId =
    segmentAfter(
      path,
      "/api/team-groups/"
    );

  if (
    teamGroupId &&
    teamGroupId !==
      "members" &&
    (
      method ===
        "PUT" ||
      method ===
        "DELETE"
    )
  ) {
    const before =
      await getTeamGroupSnapshot(
        teamGroupId
      );

    return {
      ...base,
      action:
        method ===
          "DELETE"
          ? "team_group.deleted"
          : "team_group.updated",
      targetType:
        "team_group",
      targetId:
        teamGroupId,
      metadata: {
        before,
        ...(method ===
          "DELETE"
          ? {
              after:
                null,
            }
          : {
              requested:
                req.body ??
                null,
            }),
      },
      ...(method ===
        "PUT"
        ? {
            loadAfter:
              () =>
                getTeamGroupSnapshot(
                  teamGroupId
                ),
          }
        : {}),
    };
  }

  if (
    path ===
      "/api/roles" &&
    method ===
      "POST"
  ) {
    const roleName =
      typeof req.body
        ?.name ===
        "string"
        ? req.body.name
        : "";

    return {
      ...base,
      action:
        "role.created",
      targetType:
        "role",
      metadata: {
        before:
          null,
        requested:
          req.body ??
          null,
      },
      ...(roleName
        ? {
            loadAfter:
              async () => {
                const role =
                  await prisma.role.findFirst({
                    where: {
                      name: {
                        equals:
                          roleName.trim(),
                        mode:
                          "insensitive",
                      },
                    },
                    select: {
                      id:
                        true,
                    },
                  });

                return role
                  ? getRoleSnapshot(
                      role.id
                    )
                  : null;
              },
          }
        : {}),
    };
  }

  const roleId =
    segmentAfter(
      path,
      "/api/roles/"
    );

  if (
    roleId &&
    (
      method ===
        "PUT" ||
      method ===
        "DELETE"
    )
  ) {
    const before =
      await getRoleSnapshot(
        roleId
      );

    return {
      ...base,
      action:
        method ===
          "DELETE"
          ? "role.deleted"
          : "role.updated",
      targetType:
        "role",
      targetId:
        roleId,
      metadata: {
        before,
        ...(method ===
          "DELETE"
          ? {
              after:
                null,
            }
          : {
              requested:
                req.body ??
                null,
            }),
      },
      ...(method ===
        "PUT"
        ? {
            loadAfter:
              () =>
                getRoleSnapshot(
                  roleId
                ),
          }
        : {}),
    };
  }

  return null;
}

export async function auditHttpMiddleware(
  req:
    AuthenticatedRequest,
  res:
    Response,
  next:
    NextFunction
) {
  let prepared:
    AuditPreparation | null =
    null;

  try {
    prepared =
      await prepareAudit(
        req
      );
  } catch (
    error
  ) {
    console.error(
      "Unable to prepare audit event:",
      error
    );
  }

  if (
    prepared
  ) {
    res.on(
      "finish",
      () => {
        void (
          async () => {
            try {
              let metadata =
                prepared
                  ?.metadata ??
                null;

              const successful =
                res.statusCode >=
                  200 &&
                res.statusCode <
                  400;

              if (
                successful &&
                prepared
                  ?.loadAfter
              ) {
                const after =
                  await prepared
                    .loadAfter();

                metadata = {
                  ...(metadata ??
                    {}),
                  after,
                };
              }

              const action =
                prepared
                  ?.action ===
                    "auth.sign_in_attempt"
                  ? successful
                    ? "auth.password_verified"
                    : "auth.sign_in_failed"
                  : prepared
                        ?.action ===
                        "auth.two_factor_verification"
                    ? successful
                      ? "auth.sign_in_succeeded"
                      : "auth.sign_in_failed"
                    : prepared
                        ?.action ??
                      "unknown";

              await appendAuditEvent({
                action,
                success:
                  successful,
                statusCode:
                  res.statusCode,
                actorUserId:
                  prepared
                    ?.actorUserId ??
                  null,
                actorLabel:
                  prepared
                    ?.actorLabel ??
                  null,
                targetType:
                  prepared
                    ?.targetType ??
                  null,
                targetId:
                  prepared
                    ?.targetId ??
                  null,
                ipAddress:
                  req.ip ??
                  null,
                userAgent:
                  req.get(
                    "user-agent"
                  ) ??
                  null,
                metadata,
              });
            } catch (
              error
            ) {
              console.error(
                "Unable to append audit event:",
                error
              );
            }
          }
        )();
      }
    );
  }

  next();
}
