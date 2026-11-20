# Unread email reminders: staging review

Unread reminders become due when an eligible message reaches thirty minutes
unread (brief 7.3). The number of unread messages alone never triggers an email;
the earlier ten-message trigger was removed on 21 November 2026. A durable
per-person throttle permits at most one attempt per rolling hour, across all
creators, replicas and worker restarts. The fifteen-second sweep means a newly
crossed threshold is considered on the next successful sweep, subject to sender
capacity. Unread totals are recalculated immediately before delivery.

## Scope and privacy

- Active accounts with current Chat access only. Existing channel, protected
  private-chat, creator-assignment, archive and quarantine decisions are reused.
- Owner/Ops/Developer ordinary-channel oversight does not subscribe them to
  email. Only standing private chats and channels with a current named-person
  grant count. The named grant must match that creator's assignment episode.
  Badges still cover their other accessible channels.
- Own/deleted messages, old archived assignment episodes and inactive creator
  areas are excluded. Reactions, edits and pins add no unread message.
- Each email has one To address, an unread count and a generic Hub link. No
  message text, quotes, fan names, files, channel names or staff directory.
- Chat -> Email reminders shows only the signed-in person's eligible count,
  recent reminder status and captured previews. Viewing/refreshing never sends.
- Reminder messages do not create Chat messages, alter reads, or grant access.

## Proposed first release: capture only

Release this feature branch to `staging` only, using the existing Backend build,
pre-deploy and start commands and Staging Postgres reference. Migration 28 is
additive; no existing data, roles, permissions, messages or receipts are rewritten.

After an approved successful deployment, add only these Staging Backend settings:

```text
BLOCK2_UNREAD_EMAIL_ENABLED=true
CHAT_UNREAD_EMAIL_MODE=capture
```

Keep all existing Chat and announcement settings. No Frontend flag is required.
The feature refuses Production and other Railway environments even if enabled.
Capture stores a terminal email preview and exercises the same personal hourly
limit; it never calls Gmail and never later replays that captured record as mail.
Existing unread messages since the unread-badge rollout are eligible; capture
testing may therefore produce an initial preview for already-unread test chats.

## Simple walkthrough using fictional staging accounts

1. Open an assigned QC/Chatter test account in one browser and an Owner test
   account in another. Leave the recipient on General; send into a different,
   permitted channel so the messages remain unread.
2. Starting with no eligible unread messages, send ten or more messages. The
   badge increases, but Email reminders should have no new preview yet.
3. Leave them unread for thirty minutes. Within the next successful sweep, open
   Email reminders and refresh status. Expand the individual preview: one
   recipient, count and Hub link only, with "no email sent" shown.
4. Send into another creator/channel during that hour. Confirm no second preview
   appears for the same recipient. Reading a chat must update its count normally.
5. After the hourly limit has elapsed, leave a single message unread for thirty
   minutes. A preview should appear on a sweep once the age threshold is met.
   Do not change database timestamps for this QA.
6. Check an Owner/Ops/Developer test account: ordinary oversight channels show
   badges but do not count toward reminders unless explicitly added by name.
   Their permitted standing private chats do count. Do not add yourself or grant
   extra access merely to bypass a test failure.
7. Verify the recipient's own preview on mobile, close/reopen it, and switch
   accounts. One person's reminder history must never appear for another.

Concurrent claims, access loss/deactivation/read changes immediately before send,
restarts, exact threshold boundaries, provider uncertainty and capacity reserves
are additionally exercised in guarded local integration tests.

## Real Gmail testing is a later step

Capture is not evidence of actual Gmail delivery. Before enabling real sends,
obtain approval for specific test addresses and reviewed sender budgets. Set
`CHAT_UNREAD_TEST_RECIPIENTS` to those addresses and configure the existing
`CHAT_EMAIL_HOURLY_CAP`, `CHAT_EMAIL_DAILY_CAP`,
`CHAT_EMAIL_AUTH_HOURLY_RESERVE`, `CHAT_EMAIL_AUTH_DAILY_RESERVE` and sender values.
Only then select `CHAT_UNREAD_EMAIL_MODE=gmail` on Staging Backend. Unlisted
people are not queued for later sending. No quota values are chosen by this code.

Authentication, announcements and unread reminders share the same sender ledger
whenever either Chat email feature uses Gmail. Notifications cannot consume the
reserved authentication capacity. Capacity defers reminders for at least one
minute without consuming that person's hour. Missing budget configuration blocks
Chat mail and retains the previous authentication behavior. This ledger cannot
account for other applications using the same mailbox outside the Hub.

The final recheck runs after token acquisition and refreshes the recipient and
count before building MIME. Reading the messages, losing access or disabling the
feature before this step suppresses stale delivery. Access can still change after
the final check; email deliberately contains no conversation content.

## Failure handling and disabling

An uncertain provider response becomes REVIEW. A SENDING claim older than ten
minutes becomes REVIEW on the next enabled sweep. Further reminders for that
person stay paused until an authorized operator investigates; there is no resend
button or automatic retry of an uncertain provider attempt. Do not clear REVIEW
blindly. A capacity/access skip is known not to have submitted mail and does not
consume the personal hour. A confirmed/uncertain provider attempt conservatively
consumes sender capacity and, once final validation has passed, the personal hour.

Setting `BLOCK2_UNREAD_EMAIL_ENABLED=false` stops new reminder work and hides the
new status screen. Email mode `off` stops delivery while retaining own history.
No backlog of queued unread payloads is replayed on re-enable: unread state is
recalculated. Previously captured rows stay terminal, but a fresh reminder may be
due after the existing personal hour. Keep additive migration 28 on rollback;
do not reset or drop the database. Pending announcement behavior is unchanged.

## Local validation — 5 November 2026

- 17 integration groups: count/age thresholds, multi-creator coalescing, durable
  per-person concurrency, role/named-grant scope, protected chats, archives,
  quarantine, inactive creators, reads/access/deactivation/feature changes,
  refreshed recipient/count, sender reserve, uncertain send/restart holds,
  authenticated private history, and actual MIME using an in-process fake Gmail.
- Upgrade 27 -> 28 preserves every original row/column in 44 application tables;
  reapplying migration preserves new reminder history and personal throttles.
- Existing 14 announcement and 11 unread-badge integration groups pass.
- Backend/frontend builds, strict script TypeScript, targeted ESLint, three
  Chat compatibility checks and all transactional-email template checks pass.
- Real local browser: own captured count/link preview, 390px layout without
  horizontal overflow, recoverable status-load failure/retry, and account change
  to Owner with the narrower scope explanation and no other person's history.
- No real provider calls, Railway changes, remote publication or production work.
