import {
  randomUUID,
} from "node:crypto";

import {
  mkdir,
  readFile,
  appendFile,
} from "node:fs/promises";

import {
  dirname,
  resolve,
} from "node:path";

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

let appendQueue =
  Promise.resolve();

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

function assertAuditMode() {
  const mode =
    process.env
      .AUDIT_STORE_MODE
      ?.trim()
      .toLowerCase() ??
    "file";

  if (
    mode !==
    "file"
  ) {
    throw new Error(
      `Unsupported audit store mode: ${mode}`
    );
  }

  /*
   * Local file storage is intentionally a
   * development/staging adapter only. Railway's
   * ephemeral filesystem is not an acceptable
   * production audit archive. A durable external
   * append-only adapter must replace this before
   * production rollout.
   */
  if (
    process.env.NODE_ENV ===
      "production" &&
    process.env
      .ALLOW_FILE_AUDIT_IN_PRODUCTION !==
      "true"
  ) {
    throw new Error(
      "File audit storage is disabled in production. Configure the durable append-only audit adapter before release."
    );
  }
}

export async function appendAuditEvent(
  input:
    AuditEventInput
) {
  assertAuditMode();

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

export async function readAuditEvents(
  query:
    AuditQuery = {}
) {
  assertAuditMode();

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
    Math.min(
      Math.max(
        query.limit ??
          200,
        1
      ),
      500
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
      search
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

      if (
        !haystack.includes(
          search
        )
      ) {
        continue;
      }
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
