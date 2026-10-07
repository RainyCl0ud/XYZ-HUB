import {
  prisma,
} from "../lib/prisma.js";


const ACCOUNT_ACTIVITY_ACTIONS = [
  "auth.sign_in_succeeded",
  "auth.sign_in_failed",
  "invite.accepted",
  "invite.resent",
  "people.access_changed",
  "people.group_changed",
  "people.deactivated",
  "people.reactivated",
  "two_factor.reset",
] as const;


export async function listPersonAccountActivity(
  userId:
    string
) {
  const events =
    await prisma.auditEvent.findMany({
      where: {
        targetType:
          "user",

        targetId:
          userId,

        action: {
          in: [
            ...ACCOUNT_ACTIVITY_ACTIONS,
          ],
        },
      },

      /*
       * Account activity is a history feed:
       * newest first with a deterministic tie-breaker.
       */
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
        50,

      select: {
        id:
          true,

        occurredAt:
          true,

        action:
          true,

        success:
          true,

        statusCode:
          true,
      },
    });

  return events.map(
    (
      event
    ) => ({
      id:
        event.id,

      occurredAt:
        event.occurredAt,

      action:
        event.action,

      success:
        event.success,

      statusCode:
        event.statusCode,
    })
  );
}
