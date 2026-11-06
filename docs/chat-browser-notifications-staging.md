# Browser notifications — staging

This slice covers notifications while at least one Hub tab remains open. It is
not Web Push: closing all tabs/browser, suspended devices and background mobile
delivery remain separate unfinished scope. No subscription or push provider is
created, and no message body, author name or staff list enters a notification.

## Release boundary

- Backend opt-in: `BLOCK2_BROWSER_NOTIFICATIONS_ENABLED=true` on the approved
  Staging Backend only. Existing Chat flag is also required. Production is refused
  by the server gate even if someone accidentally enables the new flag there.
- No schema migration, dependency, email-mode change or Railway command change.
- Roll back this feature by setting its Staging Backend flag to `false`. Existing
  clients stop/clear alerts after the next failed poll; Chat, badges and capture
  email reminders continue. Reverting this source commit is also schema-safe.
- Frontend stays compatible with the previous Backend: missing route/disabled
  flag hides the new button. The worker has no fetch/cache/push handler and does
  not intercept Hub traffic or subscribe the browser to an external service.

## Behaviour

Chat → Browser notifications → Enable notifications asks for native permission
only after that click. A default/denied permission never auto-prompts. The choice
is per account/browser, with Turn off and a separate labelled test notification.
Unsupported platforms show an explanation. Test native browser/OS permission on
the actual device; deterministic worker tests do not prove OS delivery.

The provider stays mounted across Hub pages. Every ten seconds it reads a bounded
feed of recent unread message IDs, rechecks current server access, then offers
eligible IDs to the worker. It never acknowledges reads. Existing read tracking
still owns those writes and pauses under notification/email settings dialogs.
No backlog older than enable time or five minutes is replayed. A batch is capped
at 50 messages; messages across several conversations combine into one Hub alert.
This is a best-effort prompt to check the Hub, not a durable delivery guarantee.
Browsers can throttle/suspend background polling; durable badges/email tracking
remain the source for unread counts.

An origin-wide Web Lock serializes tabs. A per-account shared local ledger claims
IDs before display. Network failures before claim retry; uncertain worker/OS
results do not replay. Blocked/corrupt storage fails closed. Each worker offer
checks current tab identity/choice again, and suppresses messages physically
visible in any focused Hub transcript. Merely opening a channel while scrolled
away or covered by a dialog does not count as reading it. A focused different
account suppresses the former account's pop-up.

The feed shares the confirmed email scope: Owner/Ops/Developer oversight alone
does not subscribe every ordinary channel; named channel grants and standing
private chats qualify. Current permissions, active assignments/creators,
archives, quarantine, own messages, deletions and exact read acknowledgements
are checked. Quarantine affects only that creator and keeps management private
chat eligible. Notification clicks return to a matching-account conversation;
another account or no open matching tab enters `/chat` without an old target.
Chat validates the destination against current access before opening it.

## Verified locally on 7 November 2026

- 7 database/API integration groups: environment gates, enable baseline/recent
  window, privacy/no read writes, named-role scope, final-read/quarantine/access
  recheck, protected-chat isolation, authentication/strict limits/rollback.
- 15 client/worker groups: account-specific choice/history, duplicate prevention,
  async account/choice changes, retry vs uncertain delivery, storage failures,
  other-tab reading/account suppression, generic grouped/test copy, safe click
  routes, cleanup/target validation, actual settings component states.
- Existing reminders 17, announcements 14 and unread 11 integration groups passed.
- Backend/Frontend builds, strict backend test compilation, targeted lint and
  3 legacy Chat render checks passed.
- Actual fictional local UI: desktop/mobile settings, 390px no horizontal
  overflow, QC→Owner account switch, role-specific explanation and zero console
  errors. Native permission was not granted automatically; no OS popup claimed.

## Simple staging walkthrough

1. In a desktop browser, sign in to a staging QC/Chatter test account at
   `https://portal.xyzofm.xyz/chat`. Open Browser notifications and enable them.
   Allow the browser prompt yourself, then choose Show test notification.
2. Use a separate browser profile/incognito for a second test account. Send a
   message into an allowed channel while the first account is on another tab.
   The first account should get one generic pop-up. Click it to open the channel.
   Owner/Ops senders should not expect all-channel alerts without named grants.
3. Keep the first account focused on the newest visible messages. Send another
   message. It should appear normally without a redundant pop-up.
4. Open a second Hub tab for the first account, move away, then send again. Check
   there is one pop-up, not two. Refresh and confirm it is not replayed.
5. Turn notifications off and send again. No new pop-up should appear. Existing
   unread badges and capture-only email reminders should still work.

Repeated alerts: the notification tag stays per conversation to group the
notification centre, with renotify enabled so a later new message or explicit
test click can alert again. Regression tests reproduce the former one-pop-up
failure using platform-style same-tag replacement, then verify subsequent new
messages/tests, duplicate-tab suppression and focused-message silence together.
When a newer worker is installing after refresh, setup waits for that version
instead of sending the first alert to the older active worker.

Still pending: actual staging/device permission+OS delivery acceptance, physical
mobile support, full closed-browser Web Push and separate real-email approval.
