# Staff announcements: staging review

This release adds the announcement composer and delivery foundation. It does not
enable unread reminder emails, push notifications, or production announcements.

## Behaviour

- A current Owner or Ops Manager with `chat.announcements.send` previews the full
  announcement and agency-wide audience before confirming publication. Ordinary
  channel posting settings do not prevent this explicit broadcast permission.
- Eligible recipients are active staff with current roles. Creator accounts,
  including mixed creator/staff roles, and deactivated/pending accounts are excluded.
- One immutable full-text post goes to each active creator Updates channel.
  Accountants and General Staff receive their own protected personal-chat copy.
  Creator-quarantined staff receive a copy in their current management private
  chat for that creator. A shared creator assignment never creates extra emails.
- Missing required Hub destinations block publication with a visible warning.
  No grants, assignments, quarantines, or old private-chat episodes are changed.
- Publication is transactional and uses a request reference for retries. Delivery
  has one durable row per announcement/person and rechecks current eligibility,
  email and Hub access immediately before attempting a send.
- Email content includes the entire announcement and one permitted Hub link.
  Every email has one To address and no CC/BCC batch. Concurrent workers claim
  each recipient once. Uncertain provider outcomes require review, not an
  automatic resend. The interface distinguishes Hub publication from email status.
- Links validate the requested conversation against current server permissions.
  Invalid links fall back safely; the consumed link is removed so later refreshes
  retain the person's subsequent selection.

## First deployment: capture only

Target the existing XYZ Hub **Staging** environment and `staging` source branch.
Do not merge this release into `main`, change production variables, or change
build/pre-deploy/start commands or database references.

The existing pre-deploy command applies additive migration 27 and installs the
new Owner/Ops permission once. Repeat provisioning preserves removed permissions.

After the deployment succeeds, set only these Staging Backend variables:

```text
BLOCK2_ANNOUNCEMENTS_ENABLED=true
CHAT_ANNOUNCEMENT_EMAIL_MODE=capture
```

Keep the existing `BLOCK2_CHAT_ENABLED=true`. No new frontend variable is needed;
the server advertises the capability. Capture mode stores individual previews
and never calls Gmail. It also leaves authentication capacity handling unchanged.
Do not change the existing Google credentials or sender settings for capture QA.

Production, other Railway environments and a missing feature flag are refused.

## Walkthrough with fictional staging accounts

1. As an Owner/Ops test account, open Chat → Staff announcements. Enter a title
   and a multi-paragraph announcement marked `STAGING TEST`.
2. Preview. Check the full text, active staff count, creator channels, protected
   copies, recipient list and explicit “No emails will be sent” message. Resolve
   warnings before posting; do not broaden access to bypass a warning.
3. Confirm once and publish. Verify “Posted in the Hub”. Refresh delivery status;
   recipients should show “Preview saved · no email sent”. Expand one individual
   preview and confirm the complete body, one To address and no CC/BCC.
4. As fictional Accountant, General Staff and creator-quarantined staff accounts,
   read the copy in their own permitted chat. Verify restricted Updates remains
   unavailable and another creator's access is unchanged.
5. Verify ordinary staff cannot open the announcement composer. Refresh a valid
   Hub link, then switch conversations and refresh again. The later selection
   should persist. An unavailable conversation link must reveal no hidden text.
6. Check desktop and mobile layouts. The review checkbox must gate publication;
   a delivery-status loading failure must offer status retry, not republishing.

## Before any real Gmail staging test

Capture validation is not proof of Gmail delivery. Obtain approval for specific
test addresses, review the existing sender's actual quotas/other applications,
then configure `CHAT_ANNOUNCEMENT_TEST_RECIPIENTS` and positive whole-number
`CHAT_EMAIL_HOURLY_CAP`, `CHAT_EMAIL_DAILY_CAP`,
`CHAT_EMAIL_AUTH_HOURLY_RESERVE`, `CHAT_EMAIL_AUTH_DAILY_RESERVE` values.
Hourly cap must not exceed daily cap; each authentication reserve must be below
its corresponding cap. Do not guess quota values. Only then select
`CHAT_ANNOUNCEMENT_EMAIL_MODE=gmail` in Staging. Non-allowlisted recipients are
skipped. Reservations include Hub authentication and announcements sharing the
sender, not other applications sending outside the Hub. Failed or uncertain
attempts conservatively consume a reservation. Missing capacity configuration
defers announcements and leaves existing authentication delivery unchanged.

Keep one announcement's uncertain delivery in REVIEW for investigation. There
is deliberately no automatic resend of REVIEW/SENDING attempts. A backend crash
after a provider accepted mail can leave an uncertain result; do not create a
replacement announcement as a retry without checking the prior delivery.

## Disable / recovery

Setting `BLOCK2_ANNOUNCEMENTS_ENABLED=false` removes new announcement access and
stops the delivery worker. Existing Hub posts and durable delivery records stay
retained. Email mode `off` retains pending deliveries without sending; enabling
Gmail later may process those pending rows, subject to eligibility and test-list
checks. Review pending work before changing modes. CAPTURED rows are terminal
test records and are not later sent automatically.

Keep migration 27 after disabling the feature; do not reset, drop or roll back
the database to undo a UI rollout. Restoring an older application build does not
need removal of these additive tables/column.

## Validation recorded on 2026-11-01

- 14 announcement integration groups on a guarded loopback-only fictional DB:
  scope, protected fallback, multiple assignments, stale previews, concurrency,
  individual headers/full text, capture, access loss, uncertain outcomes, restart,
  sender capacity, HTTP validation and quarantine/publication lock ordering.
- 161 existing Chat/Clock/unread integration groups passed against local DBs.
- Upgrade from 26 to 27 preserved all original columns/rows in 40 application
  tables; a second migration run preserved old and new records.
- Backend build and strict script TypeScript, frontend build, targeted ESLint,
  three Chat compatibility checks and transactional-email template checks passed.
  Authentication template output matches the committed version after whitespace
  normalization. An outdated cream-background test was updated to the existing
  agency white background; the template's authentication design was not changed.
- Real local browser: compose/preview, single publication, simulated status-load
  failure/retry, four separate captured previews, Accountant private deep link,
  invalid-link fallback, refresh and 390px mobile review. No external provider.

Railway staging deployment, user acceptance and actual test-mail delivery remain
separate release steps. Unread emails (10 unread or 30 minutes, at most one per
person per rolling hour) are the next implementation milestone.
