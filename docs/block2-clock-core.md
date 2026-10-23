# Block 2 — personal Clock and brand alignment

## Confirmed workflow

Rainheart confirmed on 23 October 2026 that shifts are recorded from the person's clock-in and clock-out, regardless of creator. One continuous shift belongs to one person. There is no creator picker, per-creator split or required creator assignment. Changing assignments, archiving/deleting a creator or moving teams cannot stop, hide or remove a person's hours. This overrides the brief's older one-creator attribution assumption.

This staging batch includes personal clock-in/out, an elapsed timer, two paid 15-minute short breaks and one paid 30-minute meal break per shift, explicit return from break, personal current-day/week totals, completed-shift history, safe retries and readable transactional audit records. It does not calculate pay or enforce a roster.

## Integrity and access

- The database server timestamps events to the second in timezone-aware Postgres fields. Client-supplied timestamps and creator IDs are rejected.
- One open shift per person, one open break per shift and one of each break type per shift are enforced with transaction locks and unique indexes. Clock-in and break-start retries use a request UUID. Repeated ending requests do not duplicate audit events or end a newer shift.
- Paid breaks are included in worked time. Raw elapsed seconds are calculated from UTC instants. Start-day/week grouping uses America/Chicago calendar conversion, including daylight saving; it never assumes a constant UTC offset or 168-hour week. Overnight shifts remain in their starting day/week.
- Current permissions and active-account status are checked on every request. The API only reads/mutates the signed-in person's shifts; there is no caller-selected user ID. Custom roles require explicit Clock permissions. Team/creator scope never grants access to other people's hours.
- Ops, Managers, QCs, Chatters, Trial Chatters, Accountants and General Staff receive personal tracking defaults. Owner, Developer and Creator receive the clock-exempt permission, which takes precedence over overlapping tracking grants. They can read their own existing history but cannot clock in by default.
- Deleting a login nulls its shift connection while retaining person-name snapshots, shifts, breaks and audit history. Creator data has no ownership relation to attendance.
- The screen uses server durations plus monotonic browser elapsed time. A device clock change cannot change recorded timestamps or shift duration. Writes pause when the latest attendance refresh is stale or unavailable. Reloading recovers the existing shift.

## Break-limit behavior in this batch

A background check runs every 15 seconds in the approved staging environment, including when nobody has the Hub open. Reading/changing attendance also uses the same reconciliation. An overdue short break is closed at exactly 30 minutes and a meal break at exactly 60 minutes. Its effective end time is the limit, even if the next refresh occurs later. The audit also records when reconciliation happened. Clock-out closes an unfinished break.

Hub reminders now appear at 20 minutes for a short break and 35 minutes for a meal. Automatic ends at 30/60 minutes create a staff/management flag. A shift still open after 14 hours is flagged without changing its hours or automatically clocking out. The attendance bell is available across Hub pages, with unread counts, a dismissible notice, personal read state, bounded history and Central timestamps. Completed-shift rows can expand to show each paid break and how it ended.

These are **Hub notices**, not device push. Browser push, corrections/approvals, manager hours views and complete attendance exports remain for the next batch. No claim of full Clock acceptance or complete Block 2 delivery.

## Staging activation — same commands

Keep the existing Staging Backend Build, Pre-deploy and Start commands. In particular, **do not replace** `npm run chat:prepare-staging --workspace=backend`; it still checks the approved Staging target before migrations and now installs Clock defaults when enabled. Keep Chat's existing flags and database audit storage.

After this release reaches the staging branch:

1. Staging → Backend → Variables: add `BLOCK2_CLOCK_ENABLED=true`, then apply/deploy. Wait for success. The logs should include `Clock permissions prepared` and `Provisioning complete`.
2. Staging → Frontend → Variables: add `VITE_BLOCK2_CLOCK_ENABLED=true`, then rebuild/deploy after Backend success. A restart alone does not enable the screen.
3. Reload Staging and sign in as a made-up staff account. Open **Clock & Hours**. Owner/Developer/Creator accounts are exempt, so use a staff test account to exercise the buttons.

The additive migrations create only Clock tables, types, constraints and indexes. Existing records and Chat grants/messages remain. Clock permission installation uses its own one-time marker and does not restore customisations on later deploys. No reset, credential change, new paid service or Production change is required. Feature flags are off by default. Keeping both Clock flags off hides the new feature while leaving its additive data intact.

## Staging test checklist

1. Clock in as a test Chatter. There is no creator selection. Reload; the same shift/timer returns.
2. Open the account in a second tab; both show the same active shift. No extra clock-in can be created.
3. Start short break 1. The shift timer continues, other break-start controls disable and break time is shown. End it; the card reads Completed and cannot be used again in that shift.
4. Try the second short break and meal break. Clock out while on a break, cancel once, then confirm. The shift closes and completed history includes paid breaks without deducting them.
5. Verify timestamp seconds and CDT/CST labels, personal day/week totals and earlier-history loading. Change the computer's clock only in an isolated test setup if testing that behavior; timestamps still come from the server.
6. Compare two different staff accounts. They must see only their own hours. Check exempt roles, a custom role with no Clock permissions and account deactivation.
7. Change a test person's creator assignments during a shift. The same shift remains open and can be ended normally.
8. As Owner, inspect Clock audit records. Check existing Chat, creator management, QA and Strike screens.
9. On a phone, page content stacks and completed-shift columns scroll inside their table container. Buttons, the clock-out dialog, keyboard focus and confidentiality footer remain usable.

The daylight-saving fixtures are in the automated local tests: 1 November 2026 midnight–3am is four hours; a Sunday 11:30pm start belongs to the week of 26 October; that Central week spans 169 actual hours. Never change the production clock or insert made-up historical shifts into Production to reproduce those tests.

## Verification

`test:clock` runs meaningful Postgres and authenticated HTTP checks in a loopback database only. `test:clock-upgrade` requires an empty local database with a name ending `_upgrade_rehearsal`; it applies the previous 20 migrations, creates existing account/QA/Strike/Chat fixtures plus completed and open Clock shifts/breaks and runs the actual guarded pre-deploy command to add alerts. Removed tracking grants and all previous record values are checked unchanged. Original record values are compared unchanged. The rehearsal never clears an existing database.

Chat styling now follows the [agency reference](xyz-design-reference.md): approved monochrome colours, Helvetica-first typography, 2px corners, no shadows, visible white focus and a 1200px content maximum. The improved selector/search/private filters and existing Chat permissions remain.

## Attendance alerts: audience and reliability

- The person sees their own break reminders, automatic ends and 14-hour flags. `clock.self.view` is required.
- `clock.alerts.team` defaults to Managers and requires `clock.access`. It permits flags for staff sharing a **current active creator assignment**, irrespective of their team. With several creators, each eligible current Manager can review the flag. A Manager never gains other staff's raw hours or correction powers from this permission.
- Accountant/General Staff flags are excluded from ordinary Manager routing, even if those staff have a creator assignment. `clock.alerts.all` defaults to Owners/Ops; it covers these and unassigned staff. Owners retain agency oversight. Developer is not automatically granted other people's attendance flags; the brief's Developer-wide Chat access does not imply global attendance access.
- New custom roles receive no automatic alert capability. Dependencies and archived-role status are checked. The new default installer has its own `clock-alerts-v1` marker, so later deployments do not restore removed grants or change existing attendance permissions.
- Permissions/active accounts/assignments are rechecked on every list/read request. Removal or creator closure removes manager access to old alerts too; another person's cursor/alert ID cannot bypass the check. Self hours remain available independently of assignments.
- Marking a notice read clears **only that person's** unread state, never another Manager's flag, and never changes times. Dismissing the small on-page notice just hides it in the current view. Read notices remain under All alerts. Finishing a break/shift updates its alert status.
- Threshold events, auto-ended breaks and readable system audit records commit together. Unique event keys and common person-row locks prevent duplicate flags/automatic ends across workers, tabs and retries. Read markers use an atomic insert so two tabs can safely acknowledge the same notice.
- Due times and first read times are saved in Postgres. Restarting the Backend catches up on open records; there is no per-person in-memory timer. An already expired break gets its automatic-end flag without an obsolete reminder. Closed historical shifts are not backfilled with invented reminders.
- The worker considers at most 100 due shifts per pass and skips locked rows for the next pass. Threshold times are exact; recording/Hub delivery can follow by a polling interval, or longer during downtime/backlogs. Repeated failed items are retried and a generic error is logged without credentials or person records.
- The worker starts only with Clock enabled on the approved Staging project/environment, or a loopback development database. It refuses Production/unknown targets. It uses the existing Backend process; no paid service, scheduler service or new Railway command/variable is needed.
- Deleting an account keeps system alerts and name snapshots alongside its hours. Personal read markers disappear with the deleted login. The guarded staging-only reset understands the new tables; this release never runs that reset against staging or Production.

## Test this release on staging

Keep both existing Clock flags enabled and all build/pre-deploy/start/database settings unchanged. Wait for the new Backend and Frontend deployments to succeed, then refresh.

1. Check the attendance bell on Clock and Chat. With no notices it shows an empty inbox; compare two test staff accounts.
2. Leave a test short break running: before 20 minutes there is no reminder; at 20 minutes a Hub notice appears (allow the background and browser polling intervals). Dismiss the small notice, then use the bell. Mark as read, switch to All alerts and confirm the history remains. Reload to check persistence.
3. Leave a short break running past 30 minutes while the Clock page is closed. Return; the break ended exactly at its limit and all time remains paid. The worker works even when no browser is connected.
4. Check the flag as a Manager sharing a current creator, an unrelated Manager, Ops and the staff member. Removing the shared creator assignment must remove that Manager's alert access on their next refresh, including history/direct IDs. Accountant/General Staff flags should reach Ops/Owner, not an ordinary Manager.
5. For a meal, the reminder threshold is 35 minutes and automatic end 60 minutes. Do not shorten real limits or adjust the live server clock to accelerate testing.
6. A 14-hour-open test shift alerts the person and management, but does not end the shift. The automated local fixtures cover this boundary without requiring a 14-hour wait or fabricating staging records.
7. Expand Break details on a completed shift. Check whether each break ended manually, automatically or with clock-out. Try phone widths and keyboard navigation; there should be no page-wide horizontal scroll.

`test:clock-alerts` runs real Postgres/HTTP checks on an isolated named loopback database: thresholds, restart-style catch-up, concurrent workers/manual requests, atomic rollback/retry, private concurrent acknowledgements, current permission/assignment routing, role dependencies, deactivation, retained snapshots, no-store responses and bounded cursor pages. The original `test:clock` covers personal hours, paid totals and DST.
