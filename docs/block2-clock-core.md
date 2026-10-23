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

When attendance is read or changed, an overdue short break is closed at exactly 30 minutes and a meal break at exactly 60 minutes. Its effective end time is the limit, even if the next refresh occurs later. The audit also records when reconciliation happened. Clock-out closes an unfinished break.

This is not yet a background reminder/notification system. Five-minute-overrun push/Hub reminders, proactive manager flags, 14-hour-open-shift alerts, corrections and approvals, manager/team views and complete attendance exports remain for the next batch. No claim of full Clock acceptance or complete Block 2 delivery.

## Staging activation — same commands

Keep the existing Staging Backend Build, Pre-deploy and Start commands. In particular, **do not replace** `npm run chat:prepare-staging --workspace=backend`; it still checks the approved Staging target before migrations and now installs Clock defaults when enabled. Keep Chat's existing flags and database audit storage.

After this release reaches the staging branch:

1. Staging → Backend → Variables: add `BLOCK2_CLOCK_ENABLED=true`, then apply/deploy. Wait for success. The logs should include `Clock permissions prepared` and `Provisioning complete`.
2. Staging → Frontend → Variables: add `VITE_BLOCK2_CLOCK_ENABLED=true`, then rebuild/deploy after Backend success. A restart alone does not enable the screen.
3. Reload Staging and sign in as a made-up staff account. Open **Clock & Hours**. Owner/Developer/Creator accounts are exempt, so use a staff test account to exercise the buttons.

The additive migration creates only Clock tables, types and constraints. Existing records and Chat grants/messages remain. Clock permission installation uses its own one-time marker and does not restore customisations on later deploys. No reset, credential change, new paid service or Production change is required. Feature flags are off by default. Keeping both Clock flags off hides the new feature while leaving its additive data intact.

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

`test:clock` runs meaningful Postgres and authenticated HTTP checks in a loopback database only. `test:clock-upgrade` requires an empty local database with a name ending `_upgrade_rehearsal`; it applies the previous 19 migrations, creates existing account/QA/Strike/Chat fixtures and runs the actual guarded pre-deploy command to add Clock. Original record values are compared unchanged. The rehearsal never clears an existing database.

Chat styling now follows the [agency reference](xyz-design-reference.md): approved monochrome colours, Helvetica-first typography, 2px corners, no shadows, visible white focus and a 1200px content maximum. The improved selector/search/private filters and existing Chat permissions remain.
