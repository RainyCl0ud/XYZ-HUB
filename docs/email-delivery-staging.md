# Owner email delivery

Staging candidate, 21 November 2026. Production is outside this release. Replaces the Chat → Email reminder log from `docs/notification-cleanup-staging.md`.

## Why

A list of every reminder with its preview was a testing aid, not something an Owner needs. Two things do matter, and nothing handled them:

- **Paused deliveries never resumed.** If Gmail doesn't confirm a send, the Hub pauses that person's reminders (or holds the announcement email) so nobody gets the same email twice. Nothing could resume them, so a single unconfirmed send stopped that person's reminders for good.
- **The daily sending limit.** All Hub email goes through one Google Workspace account, which allows about 2,000 emails a day. If it goes over, Google can stop sending for up to a day, and nobody can sign in without their emailed code (brief 7.3). The Hub's sending budget stops chat email in time; Owners now see when that's close.

## What changes

- **Audit Log → Email delivery tab** (Owner only; see `docs/audit-page-tabs-staging.md`):
  - A status line: Preview mode, Sending normally, Chat emails off, no sending budget set, daily limit nearly reached, or paused for the hour or the day. Problems are marked "!" and show how much of the daily budget is used.
  - **Needs attention**: each paused reminder or unconfirmed announcement email, with **Resume reminders** or **Mark handled**. Check the person's inbox first; nothing is re-sent.
- **The bell (Owners only)** shows "Reminder emails paused for ‹name›", "Announcement email unconfirmed for ‹name›" and "Daily email limit nearly reached" / "Chat emails paused for today", each opening Email delivery. The limit notice appears once per near-limit period and stays in the bell's history, marked read, once usage drops back.
- **Audit Log records** every reminder email ("Unread reminder email": recipient, unread count, outcome Preview saved / Email sent / Needs review, no content) and every resolve action ("Paused email delivery resolved", with who did it). Announcement emails keep their per-recipient status in Staff announcements, so they are not copied into the Audit Log.
- The Chat options **Email reminder log** and its endpoint are removed.

Two additive migrations. `20261121030000_email_delivery_review` records who resolved a paused delivery and when. `20261121040000_email_review_time` records when a delivery was paused, which dates its bell notice so a pause after "Mark all as read" still arrives unread. It also adds `EmailLimitWarning`, one row per near-limit period, so the limit notice keeps a fixed date and appears once per period, not once per check or per day. No feature flag, delivery mode or Railway setting changes. Staging stays in preview mode, so no chat email is sent and the daily-limit states can't occur there yet.

## Verification (local, loopback PostgreSQL in UTC with fictional data)

- New `test:email-delivery`, 6 groups:
  - every status, including the hourly pause, the near-limit warning and the daily pause, plus the Owner bell warning;
  - reminder audit records without content;
  - a paused reminder blocks that person until an Owner resumes it, with no resend;
  - unconfirmed announcement emails;
  - an abandoned send becomes a recorded pause;
  - strict HTTP, and the old log removed.
- Also passed: `test:chat-unread-reminders` (17), `test:hub-notifications` (9), `test:chat-announcements` (16), `test:chat-unread` (11), `test:chat-browser-notifications` (7), `test:creator-chat` (25), `test:standing-chat` (20), the audit presentation and audit database suites, `test:staging-regressions`, backend and frontend builds, frontend lint, and all 25 frontend suites (five updated for the removed Chat log).

## Staging acceptance

1. As a test Chatter, open Chat options: there is no email reminder entry.
2. As the Owner, open **Audit Log → Email delivery**. It reads "Preview mode", with "Nothing needs attention".
3. Leave a message unread for a test Chatter for 30 minutes. The Audit Log gains an "Unread reminder email" entry for them, showing the unread count and "Preview saved". No message text appears.
4. Paused deliveries and the daily limit only occur with real sending, so they can't be produced on Staging in preview mode. They are covered by the local tests above.
