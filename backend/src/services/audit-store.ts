import {
  randomUUID,
} from "node:crypto";

import {
  appendFile,
  mkdir,
  readFile,
} from "node:fs/promises";

import {
  dirname,
  resolve,
} from "node:path";

import {
  Prisma,
} from "@prisma/client";

import {
  prisma,
} from "../lib/prisma.js";

export type AuditEvent = {
  id: string;
  occurredAt: string;
  action: string;
  success: boolean;
  statusCode: number;
  actorUserId: string | null;
  actorLabel: string | null;
  targetType: string | null;
  targetId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
};

export type AuditEventInput =
  Omit<
    AuditEvent,
    "id" |
    "occurredAt"
  > & {
    occurredAt?: Date;
  };

export type AuditQuery = {
  search?: string;
  action?: string;
  success?: boolean;
  from?: Date;
  to?: Date;
  limit?: number;
};

type AuditStoreMode =
  | "file"
  | "database";

type DatabaseAuditEvent = {
  id: string;
  occurredAt: Date;
  action: string;
  success: boolean;
  statusCode: number;
  actorUserId: string | null;
  actorLabel: string | null;
  targetType: string | null;
  targetId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Prisma.JsonValue | null;
};

let appendQueue =
  Promise.resolve();

function getAuditStoreMode():
  AuditStoreMode {
  const configured =
    process.env
      .AUDIT_STORE_MODE
      ?.trim()
      .toLowerCase();

  if (
    !configured ||
    configured ===
      "file"
  ) {
    return "file";
  }

  if (
    configured ===
      "database" ||
    configured ===
      "postgres" ||
    configured ===
      "postgresql"
  ) {
    return "database";
  }

  throw new Error(
    `Unsupported audit store mode: ${configured}`
  );
}

function assertFileAuditAllowed() {
  /*
   * Local file storage remains available for development and
   * isolated adapter tests. Railway/production must use the
   * durable PostgreSQL adapter.
   */
  if (
    process.env.NODE_ENV ===
      "production" &&
    process.env
      .ALLOW_FILE_AUDIT_IN_PRODUCTION !==
      "true"
  ) {
    throw new Error(
      "File audit storage is disabled in production. Configure AUDIT_STORE_MODE=database."
    );
  }
}

function getAuditFilePath() {
  const configured =
    process.env
      .AUDIT_FILE_PATH
      ?.trim();

  if (
    configured
  ) {
    return resolve(
      configured
    );
  }

  return resolve(
    process.cwd(),
    ".local-data",
    "audit-events.jsonl"
  );
}

function normalizeMetadata(
  value:
    Prisma.JsonValue |
    null
):
  Record<
    string,
    unknown
  > |
  null {
  if (
    value &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value
    )
  ) {
    return value as Record<
      string,
      unknown
    >;
  }

  return null;
}

function toDatabaseAuditEvent(
  row:
    DatabaseAuditEvent
):
  AuditEvent {
  return {
    id:
      row.id,

    occurredAt:
      row.occurredAt.toISOString(),

    action:
      row.action,

    success:
      row.success,

    statusCode:
      row.statusCode,

    actorUserId:
      row.actorUserId,

    actorLabel:
      row.actorLabel,

    targetType:
      row.targetType,

    targetId:
      row.targetId,

    ipAddress:
      row.ipAddress,

    userAgent:
      row.userAgent,

    metadata:
      normalizeMetadata(
        row.metadata
      ),
  };
}

function getLimit(
  query:
    AuditQuery
) {
  return Math.min(
    Math.max(
      query.limit ??
        200,
      1
    ),
    500
  );
}

function matchesSearch(
  event:
    AuditEvent,
  search:
    string
) {
  const haystack =
    [
      event.action,
      event.actorUserId,
      event.actorLabel,
      event.targetType,
      event.targetId,
      event.metadata
        ? JSON.stringify(
            event.metadata
          )
        : null,
    ]
      .filter(
        Boolean
      )
      .join(
        " "
      )
      .toLocaleLowerCase();

  return haystack.includes(
    search
  );
}

async function appendDatabaseAuditEvent(
  input:
    AuditEventInput
) {
  const metadata =
    input.metadata ===
      null
      ? Prisma.DbNull
      : JSON.parse(
          JSON.stringify(
            input.metadata
          )
        ) as Prisma.InputJsonValue;

  const created =
    await prisma.auditEvent.create({
      data: {
        occurredAt:
          input.occurredAt ??
          new Date(),

        action:
          input.action,

        success:
          input.success,

        statusCode:
          input.statusCode,

        actorUserId:
          input.actorUserId,

        actorLabel:
          input.actorLabel,

        targetType:
          input.targetType,

        targetId:
          input.targetId,

        ipAddress:
          input.ipAddress,

        userAgent:
          input.userAgent,

        metadata,
      },
    });

  return toDatabaseAuditEvent(
    created
  );
}

async function readDatabaseAuditEvents(
  query:
    AuditQuery
) {
  const where:
    Prisma.AuditEventWhereInput = {};

  if (
    query.action
  ) {
    where.action =
      query.action;
  }

  if (
    query.success !==
      undefined
  ) {
    where.success =
      query.success;
  }

  if (
    query.from ||
    query.to
  ) {
    where.occurredAt = {
      ...(query.from
        ? {
            gte:
              query.from,
          }
        : {}),

      ...(query.to
        ? {
            lte:
              query.to,
          }
        : {}),
    };
  }

  const limit =
    getLimit(
      query
    );

  const search =
    query.search
      ?.trim()
      .toLocaleLowerCase();

  if (
    !search
  ) {
    const rows =
      await prisma.auditEvent.findMany({
        where,

        orderBy: [
          {
            occurredAt:
              "desc",
          },
          {
            id:
              "desc",
          },
        ],

        take:
          limit,
      });

    return rows.map(
      toDatabaseAuditEvent
    );
  }

  /*
   * Metadata is JSON and the existing audit search intentionally
   * searches arbitrary metadata content. To preserve that behavior
   * without unsafe raw SQL, scan immutable rows in deterministic
   * batches until enough matches are found.
   */
  const events:
    AuditEvent[] = [];

  const batchSize =
    500;

  let cursor:
    string |
    undefined;

  while (
    events.length <
      limit
  ) {
    const rows =
      await prisma.auditEvent.findMany({
        where,

        orderBy: [
          {
            occurredAt:
              "desc",
          },
          {
            id:
              "desc",
          },
        ],

        take:
          batchSize,

        ...(cursor
          ? {
              cursor: {
                id:
                  cursor,
              },

              skip:
                1,
            }
          : {}),
      });

    if (
      rows.length ===
      0
    ) {
      break;
    }

    for (
      const row
      of rows
    ) {
      const event =
        toDatabaseAuditEvent(
          row
        );

      if (
        matchesSearch(
          event,
          search
        )
      ) {
        events.push(
          event
        );

        if (
          events.length >=
            limit
        ) {
          break;
        }
      }
    }

    if (
      rows.length <
        batchSize
    ) {
      break;
    }

    cursor =
      rows[
        rows.length -
          1
      ].id;
  }

  return events;
}

async function appendFileAuditEvent(
  input:
    AuditEventInput
) {
  assertFileAuditAllowed();

  const event:
    AuditEvent = {
    id:
      randomUUID(),

    occurredAt:
      (
        input.occurredAt ??
        new Date()
      ).toISOString(),

    action:
      input.action,

    success:
      input.success,

    statusCode:
      input.statusCode,

    actorUserId:
      input.actorUserId,

    actorLabel:
      input.actorLabel,

    targetType:
      input.targetType,

    targetId:
      input.targetId,

    ipAddress:
      input.ipAddress,

    userAgent:
      input.userAgent,

    metadata:
      input.metadata,
  };

  const filePath =
    getAuditFilePath();

  appendQueue =
    appendQueue
      .catch(
        () =>
          undefined
      )
      .then(
      async () => {
        await mkdir(
          dirname(
            filePath
          ),
          {
            recursive:
              true,
          }
        );

        await appendFile(
          filePath,
          `${JSON.stringify(
            event
          )}\n`,
          {
            encoding:
              "utf8",
            flag:
              "a",
          }
        );
      }
    );

  await appendQueue;

  return event;
}

async function readFileAuditEvents(
  query:
    AuditQuery
) {
  assertFileAuditAllowed();

  const filePath =
    getAuditFilePath();

  let raw =
    "";

  try {
    raw =
      await readFile(
        filePath,
        "utf8"
      );
  } catch (
    error
  ) {
    const nodeError =
      error as NodeJS.ErrnoException;

    if (
      nodeError.code ===
        "ENOENT"
    ) {
      return [];
    }

    throw error;
  }

  const search =
    query.search
      ?.trim()
      .toLocaleLowerCase();

  const limit =
    getLimit(
      query
    );

  const events:
    AuditEvent[] = [];

  const lines =
    raw
      .split(
        "\n"
      )
      .filter(
        Boolean
      )
      .reverse();

  for (
    const line
    of lines
  ) {
    let event:
      AuditEvent;

    try {
      event =
        JSON.parse(
          line
        ) as AuditEvent;
    } catch {
      continue;
    }

    if (
      query.action &&
      event.action !==
        query.action
    ) {
      continue;
    }

    if (
      query.success !==
        undefined &&
      event.success !==
        query.success
    ) {
      continue;
    }

    const occurredAt =
      new Date(
        event.occurredAt
      );

    if (
      query.from &&
      occurredAt <
        query.from
    ) {
      continue;
    }

    if (
      query.to &&
      occurredAt >
        query.to
    ) {
      continue;
    }

    if (
      search &&
      !matchesSearch(
        event,
        search
      )
    ) {
      continue;
    }

    events.push(
      event
    );

    if (
      events.length >=
        limit
    ) {
      break;
    }
  }

  return events;
}

export async function appendAuditEvent(
  input:
    AuditEventInput
) {
  const mode =
    getAuditStoreMode();

  if (
    mode ===
      "database"
  ) {
    return appendDatabaseAuditEvent(
      input
    );
  }

  return appendFileAuditEvent(
    input
  );
}

export async function readAuditEvents(
  query:
    AuditQuery = {}
) {
  const mode =
    getAuditStoreMode();

  if (
    mode ===
      "database"
  ) {
    return readDatabaseAuditEvents(
      query
    );
  }

  return readFileAuditEvents(
    query
  );
}
