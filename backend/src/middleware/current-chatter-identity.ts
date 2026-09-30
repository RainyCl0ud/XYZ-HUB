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

function rewriteCurrentChatterNames(
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
