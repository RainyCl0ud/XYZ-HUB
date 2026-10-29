# Strike creator-team read hotfix

## Problem and deliberately narrow scope

A QC with View Strikes and Self + subordinates could not read another manager's
Strike for a Chatter under the same creator when Quality Checker and Chatter
were sibling organization groups. The employee filter is derived from visible
Strike records, so the blocked read also produced an empty employee dropdown.

The read-only extension requires all of the following:

- Current View Strikes plus its module permission dependency (existing checks).
- Self + subordinates, with both employees assigned to an organization group.
- Exactly one current creator assignment on each account, and the same creator.
- Both organization groups share the same non-null immediate parent.
- The target holds Chatter or Trial Chatter, has no Owner role, and every target
  role has a numeric authority rank below the reviewer's rank.

This extension is used only for the Strike list, direct details, source-incident
lookup and person Strike history. Issuer identity never determines read access.
Existing organization rules remain available as before. Issue, preview, eligible
targets and void continue to use the original management checks: this hotfix
does not grant new write authority or alter People/QA permissions.

Multi-creator staff, different organization branches, missing assignments,
unranked/mixed higher roles, Self-only and deleted-user records retain their
previous boundaries. Strike records are employee-wide, not creator-specific;
broader cross-creator visibility requires a separate policy and design review.
This is not a wholesale conversion of organization groups into creator teams.

## Isolation and verification

Prepared from production commit `dfe1a3980e230521a6c910789fd3cda0b13e7a42`,
tree `12169f1bd595309ec47b540216d78735af49ff87`, in a separate checkout.
Only the Strike service, a guarded regression script, its npm script and this
document are changed. No dependencies, schema, migrations, frontend, Railway
settings, flags, credentials or existing role grants are changed.

Use a dedicated disposable local database on `127.0.0.1:55484` named
`strike_hotfix_*`, with `NODE_ENV=test`, then run
`npm run test:strike-creator-scope --workspace=backend`.
The script refuses Railway environments and other database targets, creates
fictional records and removes its own fixtures. It exercises actual sessions,
permission revocation, transfers, creator/team isolation, role protections,
read-only versus write scope and retained deleted history. It is not a command
to run against the live Hub or the shared Railway staging database.

The original production source reproduced the sibling-group read failure.
The fixed production-based source passed the nine regression groups, backend
build and test type check, Strike foundation, access-control, team-hierarchy,
People hierarchy and current QA creator-access regressions.

## Staging acceptance before any production release

1. Use fictional staging QC/Chatter accounts assigned only to creator A, in
   sibling Quality Checker/Chatter groups under the same immediate team parent.
2. Confirm the QC role has View Strikes and Self + subordinates. Use an existing
   staging Strike issued by another authorized management account.
3. Confirm the record appears in the list, employee filter and detail dialog;
   check expired/voided history where available.
4. Confirm a QC assigned only to creator B cannot list or open that record.
5. Confirm Self-only, view-only action permissions, higher/mixed-role targets,
   separate organization parents and multi-creator staff keep existing limits.
6. Remove a test assignment or View Strikes; refresh and verify access is gone.
7. Confirm existing Chat/Clock and ordinary People/QA navigation still work.

Do not merge staging into main. Any later production PR must be based on the
verified production version and contain only the four hotfix paths. Production
deployment requires a separate explicit release instruction after acceptance.
Rollback is the previous production build; no schema or data rollback is needed.
