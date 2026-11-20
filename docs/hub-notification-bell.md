# One header bell for every notice

Staging candidate, 21 November 2026. Production is outside this release.

## What changes

The header bell is now the Hub's single place for notices addressed to a person. It opens a dropdown (not a page) with **All / Unread**, **New** and **Earlier** groups, **Mark all as read** and **See older notifications**. Each notice opens the page it is about.

| Notice | Who sees it | Opens |
|---|---|---|
| Mention | The person mentioned (never self-mentions) | That exact message in Chat, highlighted |
| Staff announcement | Its delivery recipients, not the author | The announcement post |
| Paid break reminder | The person on break | Clock & Hours |
| Break ended automatically, shift open 14 hours | The person, and current management under the existing Clock alert rules | Clock & Hours |
| Clock correction to review | Current reviewers under the existing correction routing | The request |
| Your correction approved or rejected | The requester | The request |

Chat unread counts are **not** in the bell. Channel badges keep showing them. Reactions and quarantines still notify nobody (brief 7.1, 6.2).

- The separate **Mentions** list in Chat and the sidebar mention badge are removed; the bell replaces both. The sidebar's correction-review badge stays as a work-queue count.
- The **My Account → Notification** switch is unchanged. When it is on, attendance and correction notices from the last 24 hours can also appear as a device alert while a Hub tab is open but not in focus (including a background tab). The wording is fixed and carries no names or message text. Mentions and announcements keep following the Chat alert rules of brief 7.3, so they never produce a second device alert.
- **Unread email reminders:** the ten-message trigger is removed. An email is due only when a message has been unread for 30 minutes, at most one per person per hour (brief 7.3).

## How it works

Notices are not copied anywhere. Each time the bell loads, they are read from their source records with that feature's own access rule: Chat access (including quarantine, assignment, archive and deletion) for mentions and announcements, the Clock alert audience, and correction routing. Losing access removes a notice at once; regaining it brings the notice back.

Only read state is stored, in two new tables: `HubNotificationRead` (one row per notice someone opened) and `HubNotificationState` (the "Mark all as read" time). Reading a mentioned message or an announcement in Chat also clears its notice. Opening a notice in the bell never marks the Chat message itself read.

Migration `20261121010000_hub_notification_inbox` is additive. No feature flag, Railway setting or delivery mode changes. The API is `/api/notifications` (`GET /`, `GET /summary`, `POST /read`, `POST /read-all`), signed-in only, `no-store`, and returns 404 when Block 2 Chat and Clock are both off.

The notice wording is a placeholder. Brief 11.2 says XYZ supplies the wording for every push and in-Hub notice, so Dim should approve or replace it before release.

## Verification (local, loopback PostgreSQL in UTC with fictional data)

- New `test:hub-notifications`, 9 groups: mention targeting, read sync with Chat, removal on deletion/lost assignment/quarantine/archive, announcement recipients, Clock audience, correction routing, merged history pages with equal timestamps, Mark all as read, and strict HTTP.
- `test:chat-unread-reminders`, 17 groups, updated for the 30-minute-only rule. Its earlier failure at the 30-minute check was the test database running in a non-UTC timezone, not a code defect; Railway Postgres runs in UTC.
- Also passed: `test:chat-mentions` (9), `test:chat-unread` (11), `test:chat-announcements` (16), `test:chat-browser-notifications` (7), `test:creator-chat` (25), `test:standing-chat` (20), `test:clock` (18), `test:clock-alerts` (15), `test:clock-corrections` (21), `test:chat-interactions` (23), `test:chat-moderation` (19), `test:chat-quarantine` (17), `test:chat-live-events` (4), `test:step1:role-builder` (21), `test:access` (9), `test:staging-regressions`, backend build, frontend build and lint, and all 25 frontend suites, including the new `test:notification-bell` and a new service-worker group in `test:browser-notifications` (19).
- `test:chat-mentions` and `test:chat-message-grouping` (frontend) could not start from a folder whose path contains a space; their root path is now decoded with `fileURLToPath`.

## Staging acceptance

Use fictional test accounts on https://portal.xyzofm.xyz.

1. As a test Owner, mention a test Chatter in a creator channel. As the Chatter, the bell shows **1**. Open it: the notice reads "… mentioned you" with the creator and channel. Click it: Chat opens that exact message, highlighted, and the badge clears.
2. Mention the Chatter again and read the message in Chat without using the bell. The bell clears on its own.
3. Remove the Chatter from that creator. Their mention notices disappear from the bell. Re-assign them: the notices return.
4. Send a staff announcement as Owner or Ops. Recipients see "Staff announcement" in the bell, and it opens the post. The sender does not see their own.
5. As the Chatter, start a short break and leave it running past 20 minutes. The bell shows the break's return reminder, and the pop-up notice appears in the corner. At 30 minutes, the test Manager on that creator sees "‹Chatter's name›: … ended automatically".
6. Submit a missing-shift correction as the Chatter. The Manager sees "Clock correction to review", which opens the request. Approve it: the Chatter sees "Your clock correction was approved".
7. With **My Account → Notification** on, put the Hub tab in the background and repeat step 5. A device alert "XYZ Hub · Paid break reminder" appears with no names. Clicking it opens Clock & Hours.
8. **Mark all as read** clears the badge for that person only. **See older notifications** loads earlier history without repeats. The Chat page no longer has a Mentions list, and the sidebar has no mention badge.
9. Check the dropdown on a phone: it spans the screen width below the header and scrolls inside itself.
