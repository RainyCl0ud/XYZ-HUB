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
  reconcileQaChatterProfiles,
} from "../services/qa-chatter-profile-sync.js";

export function rewriteCurrentChatterNames(
  value: unknown,
  currentNames: ReadonlyMap<string, string>
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) =>
      rewriteCurrentChatterNames(
        item,
        currentNames
      )
    );
  }

  if (
    !value ||
    typeof value !== "object"
  ) {
    return value;
  }

  /*
   * Prisma responses still contain native Date instances before Express
   * serializes them. Rebuilding every object with Object.fromEntries()
   * turns Date values into {}, which later causes frontend date formatters
   * to throw "Invalid time value". Only recurse into plain JSON objects.
   */
  const prototype =
    Object.getPrototypeOf(
      value
    );

  if (
    prototype !== Object.prototype &&
    prototype !== null
  ) {
    return value;
  }

  const source =
    value as Record<string, unknown>;

  const rewritten =
    Object.fromEntries(
      Object.entries(source).map(
        ([key, item]) => [
          key,
          rewriteCurrentChatterNames(
            item,
            currentNames
          ),
        ]
      )
    ) as Record<string, unknown>;

  const id =
    typeof source.id === "string"
      ? source.id
      : null;

  if (
    id &&
    currentNames.has(id) &&
    typeof source.name === "string"
  ) {
    rewritten.name =
      currentNames.get(id) ??
      source.name;
  }

  return rewritten;
}

/**
 * Linked QA Chatter records and Login Gate users represent the same
 * employee identity. User.name is the canonical current display name.
 *
 * Historical incident facts (rule snapshots, timestamps, severity,
 * weight, details, etc.) remain untouched. This middleware only
 * normalizes returned chatter names for already-authorized QA payloads.
 * Unlinked QA-only chatters keep their own Chatter.name.
 */
export async function presentCurrentChatterIdentity(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.access) {
    next();
    return;
  }

  try {
    /*
     * A People record with Chatter / Trial Chatter role must appear in QA
     * even before the first incident exists. Reconcile only on chatter GETs
     * so ordinary incident/dashboard requests do not carry this maintenance
     * cost.
     */
    if (
      req.method === "GET" &&
      req.originalUrl
        .split("?", 1)[0]
        .startsWith(
          "/api/chatters"
        )
    ) {
      await reconcileQaChatterProfiles();
    }

    const linkedChatters =
      await prisma.chatter.findMany({
        where: {
          userId: {
            not: null,
          },
        },
        select: {
          id: true,
          user: {
            select: {
              name: true,
            },
          },
        },
      });

    const currentNames =
      new Map(
        linkedChatters
          .filter(
            (
              chatter
            ): chatter is typeof chatter & {
              user: {
                name: string;
              };
            } =>
              Boolean(
                chatter.user?.name
              )
          )
          .map(
            (chatter) => [
              chatter.id,
              chatter.user.name,
            ] as const
          )
      );

    if (
      currentNames.size > 0
    ) {
      const originalJson =
        res.json.bind(res);

      res.json = ((body: unknown) =>
        originalJson(
          rewriteCurrentChatterNames(
            body,
            currentNames
          )
        )) as typeof res.json;
    }
  } catch (error) {
    console.error(
      "Unable to normalize current chatter identity:",
      error
    );
  }

  next();
}
