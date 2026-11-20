# Notification cleanup after the header bell

Staging candidate, 21 November 2026. Production is outside this release. Follows `docs/hub-notification-bell.md`.

## What changes

- **The email reminder screen is Owner-only.** Staff no longer see "Email reminders" under Chat options; their reminder simply arrives by email after 30 minutes unread. Owners get **Chat → Email reminder log**, listing recent reminders for every staff member: name, status, unread count, time and the stored preview, with **Load older reminders**.
- **Announcements no longer count toward reminder emails.** Each staff announcement already sends its own email (brief 6.1) and appears in the header bell. Its post still shows as unread in Chat and on channel badges.
- **Turning notifications off also clears background push on the server.** Before, My Account → Notification → Off only unsubscribed this browser; the Hub's record stayed until the push service rejected a later send. The error shown if a browser can't stop background alerts now gives a real next step instead of pointing to "advanced settings" that no longer exist.
- The unused background-push settings panel is removed.

No migration, feature flag, delivery mode or Railway setting changes. Background push stays switched off on Staging; enabling it is a separate decision.

## Verification (local, loopback PostgreSQL in UTC with fictional data)

- `test:chat-unread-reminders` (17 groups) now also checks that an announcement post never counts toward a reminder, and that only Owners can open the log over HTTP (403 for staff, 404 when the feature is off, no writes on view).
- Also passed: `test:hub-notifications` (9), `test:chat-announcements` (16), `test:chat-browser-notifications` (7), `test:chat-unread` (11), `test:creator-chat` (25), `test:standing-chat` (20), `test:chat-quarantine` (17), `test:chat-mentions` (9), backend and frontend builds, frontend lint, and all 25 frontend suites (three updated for the new wording; `test:notification-bell` gains a group for this release).

## Staging acceptance

1. As a test Chatter, open Chat options: there is no Email reminders entry.
2. As the Owner, open **Chat options → Email reminder log**. It lists recent reminders with each person's name and status. In capture mode the status line reads "Preview mode · no emails are sent".
3. As Owner or Ops, send a staff announcement and leave it unread for 30 minutes as a test Chatter. No reminder for it appears in the log. An ordinary unread message still produces one after 30 minutes.
4. In My Account, turn Notification on and then off. The switch turns off with no error.
