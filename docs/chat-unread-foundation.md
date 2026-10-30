# Chat unread tracking — staging candidate, 30 October 2026

This is the first dependency for Dim's announcement/unread notification milestone.
It implements badges/read state only. Announcement creation/fanout, email delivery,
hourly throttling/capacity reserves, role-specific email subscriptions and browser
push are not implemented or activated by this change.

## Behavior

- Creator selector totals, conversation badges and an unread-only list filter.
- New, non-deleted received messages in CURRENTLY accessible active conversations
  count as unread. Own sends, edits, reactions and pin changes do not add a count.
- The same ordinary/protected/private/quarantine access checks used for messages
  determine the unread audience. Archives have no unread count.
- A transcript GET, search result, pin lookup or background refresh is not a read.
  Visible messages in a focused tab are acknowledged after 700ms. Background tabs,
  covered panes and dialogs do not clear them. Short messages need 80% visible;
  longer messages need 120px visible. Acknowledgements are batched.
- Mark conversation read explicitly clears committed messages through the latest
  loaded, non-deleted message, including earlier history. Later arrivals remain
  unread. Reading one channel never clears another.
- Individual per-message/person receipts are durable and safe for concurrent tabs
  and retries. A late-committing older timestamp cannot silently disappear behind
  a read watermark. No public read-receipt/user-read-status endpoint is exposed.
- One migration-time UTC cutoff excludes pre-rollout history from unread counts;
  that history remains readable. Redeployments never reset this cutoff.
- Old backend responses lacking new fields still render. No unread controls make
  calls when that backend does not supply unread data.

## Data and release boundaries

Additive migration 26: `20261030010000_chat_read_state`. It creates
`ChatMessageRead` (message/user foreign keys, unique pair) and one `ChatSetup`
cutoff marker. It does not rewrite messages, roles, assignments, incidents,
strikes or hours. No existing migration is edited.

Based on staging source tree `b6e9b56b259c2d3e16b701609ff15eff1647ebc4`
(remote staging `08c638d100c147ef67ff16b482caf54242223bd4`). This includes
the already tested Strike read hotfix. Do not merge this branch into main.
Production's isolated hotfix release is separate at `7b0e44c1`.

Use existing Staging build, pre-deploy, start commands, database reference and
feature flags. No new provider, mail switch, credential, command or paid service
is needed. Before any later notification worker, implement Dim's exact 10-message
or 30-minute trigger, one/person/rolling-hour durable limit, current-access
recheck, privileged-role notification exceptions and shared authentication mail
capacity reserve. `/unread` badge totals alone are not email eligibility.

If rolling back this batch, roll application code back and retain migration 26
and its receipts/cutoff. Do not reset the database. Earlier staging code ignores
these additive tables. Once old code stops acknowledging reads, the count can
grow until this feature is restored; do not attach email delivery meanwhile.

## Validation completed locally

- 11 new integration groups: ordinary/private visibility, another creator,
  multi-assignment scope, own/deleted/old message exclusions, explicit read batches,
  tied cutoff and later messages, concurrent tabs/retries, late-commit race,
  quarantine/current access, archives, deactivation, strict authenticated HTTP,
  no-store responses and no message text in summary data.
- Upgrade rehearsal 25 → 26 snapshots existing users, assignments, grants, private
  chats, edited/pinned messages, replies/reactions, shifts, incidents and strikes;
  all unchanged. New reads work and rerunning migration preserves read state.
- Existing suites: ordinary chat 22, protected chats 18, interactions 23,
  moderation 19, quarantine 17, Clock 18, corrections 18: 135 checks/groups passed.
- Backend and frontend builds; strict staging-script TypeScript check; targeted
  Chat ESLint; existing three frontend compatibility checks passed.
- Actual local browser: desktop and 390×844 phone view. Unread-only filtering keeps
  the selected conversation available; marking General read preserves Updates;
  opening Updates clears only its visible message. Hidden tab and search-dialog
  incoming-message checks retain zero receipts until the message becomes visible,
  then save one receipt. Actual mobile hardware/keyboard QA remains pending.
- Windows Prisma engine generation cannot run while integration tests hold its
  DLL open. Sequential generation/build after tests succeeds. This is a local
  Windows file lock, not an application or Railway build failure.
- Corrected an initially detected UTC/local database-session offset in the cutoff
  and raw bulk-read comparison; the upgrade test checks the UTC cutoff explicitly.

All tests and preview data use loopback PostgreSQL on port 55484 in isolated
`block2_unread_...` databases and fictional `example.test` identities. No shared
Railway database was tested or changed. The preview harness is untracked local
tooling, not part of the app. No email provider was called.

## Staging walkthrough after approval and deployment

1. Test accounts in separate browsers: send a message into another conversation;
   confirm its badge without clearing it by staying in the current conversation.
2. Open the conversation: visible messages clear; earlier unseen history remains.
   Load earlier history, or explicitly mark the conversation read.
3. Repeat on phone width, including Browse and unread-only/empty-list states.
4. Keep the receiving tab hidden or open Search/Members; send another test message.
   Confirm it remains unread until the conversation is visible and focused.
5. Refresh/sign in in another tab; saved reads remain saved. Repeat a creator pause
   or assignment removal using test accounts; hidden conversations must disappear
   from counts without disturbing another creator or the permitted private chat.

Authenticated staging acceptance and actual-device QA are pending. This document
does not claim the whole notifications/announcements milestone is complete.
