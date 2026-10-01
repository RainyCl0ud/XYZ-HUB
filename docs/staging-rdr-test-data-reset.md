# Staging RDR Test-Data Reset

This utility replaces XYZ Management Hub **Staging** business/test data with a deterministic Red Dead Redemption themed dataset while preserving existing Owner accounts.

## Safety contract

The reset script:

- refuses to mutate unless `RAILWAY_ENVIRONMENT_NAME` resolves to `Staging`;
- refuses to mutate unless `STAGING_RESET_CONFIRM=RESET_XYZ_STAGING` is set for that command;
- aborts if no Owner account exists;
- optionally checks `STAGING_RESET_PRESERVE_EMAILS` and aborts if a listed existing account is not currently an Owner;
- preserves Owner user records, passwords, status, active sessions, email/authenticator 2FA methods and the Owner role;
- removes Owner creator assignments and stacked non-Owner roles so the test environment is clean;
- never targets Production.

The utility intentionally clears Staging audit events together with the old test dataset.

## Seeded coverage

The deterministic dataset includes:

- 15 staff records covering Ops Manager, Manager, QC, Chatter, Trial Chatter, Dev, Accountant and General Staff;
- active, pending-setup and deactivated People states;
- a stacked `QC + Chatter` employee;
- 6 creators, including one inactive creator;
- a root organization plus Van der Linde Operations, Horseshoe Overlook, Clemens Point and Shady Belle groups;
- 4 severities and 4 strike weights;
- 7 QA rules, including one archived rule and a versioned rule;
- the default 30-day strike ladder;
- 15 incidents spanning OPEN, RESOLVED, VOIDED and expired-strike scenarios.

Demo People records use reserved `.test` email addresses. They are intended for UI/data testing, not real email-2FA login.

## Validation only

This does not connect to or modify the database:

```powershell
npm run staging:validate-test-data
```

## Dry run against Railway Staging

Run with Railway configured for the `Staging` environment. No rows are changed:

```powershell
$env:STAGING_RESET_PRESERVE_EMAILS="dim@xyzofm.xyz"
railway run npm run staging:reset-test-data -- --dry-run
```

The dry run prints the Owner accounts that will be preserved and current row counts scheduled for replacement.

## Destructive Staging reset

Only after reviewing the dry-run output:

```powershell
$env:STAGING_RESET_PRESERVE_EMAILS="dim@xyzofm.xyz"
$env:STAGING_RESET_CONFIRM="RESET_XYZ_STAGING"
railway run npm run staging:reset-test-data
```

After the command completes, remove the temporary confirmation variable from the local shell if desired:

```powershell
Remove-Item Env:STAGING_RESET_CONFIRM -ErrorAction SilentlyContinue
Remove-Item Env:STAGING_RESET_PRESERVE_EMAILS -ErrorAction SilentlyContinue
```

## Post-reset acceptance checks

Confirm that:

- existing Owner accounts can still use their current sessions/login and 2FA;
- Owners remain hidden from ordinary People Management views;
- People displays the RDR staff and mixed account states;
- Creators displays six seeded creators and one inactive creator;
- QA Overview has meaningful counts;
- Incidents contains current, resolved, voided and expired examples;
- Chatters displays current People names;
- Rules shows the versioned and archived examples;
- Configuration shows the seeded severity, weight and strike-ladder data;
- hierarchy filters and creator/model scope behave as expected.
