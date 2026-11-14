# Block 2 — My Strikes and archived Chat acceptance (Staging only)

Based on the October 2026 **Block 2 Build Brief — Clock, Chat and Role Screens** and Staging commit `71a15e3`. Existing Clock & Hours UAT and Chat Members-panel/composer UAT are already accepted; do not repeat them.

## Automated safety tests

On the dedicated feature branch, run:

```powershell
npm run build:backend
npm run lint --workspace=frontend
npm run test:block2-acceptance-guards --workspace=backend
npm run test:staging-regressions --workspace=backend
```

The dedicated regression script uses in-memory Prisma delegates and read-only source checks. It must never create, update, delete or reset real records. The scope includes:

- Reject unauthenticated and unauthorized My Strikes requests before any data query
- Reject foreign-user or invalid pagination parameters
- Return only signed-in user's strike snapshots, including status, with 10-record pages
- Require the exact approved Staging Railway target and the dependent archive/export/cleanup flags
- Preserve Owner-only archive/export/cleanup checks, archived-channel precondition, completed ZIP transfer audit, and explicit Owner confirmation
- Keep the My Strikes UI permission-gated and read-only

This source and in-memory regression suite **does not replace authenticated Staging browser UAT or a ZIP restoration check**.

## My Strikes — authenticated Staging UAT

Use two made-up employees with distinct historical strike fixtures. Never modify real employee data just to test.

1. Sign in as fictional Employee A with the permission to view their own strikes. Open **My Strikes** and confirm reason, status, standing snapshot, issue time, expiry time and details. No Issue, Void or Dispute action should appear.
2. Sign in as fictional Employee B. Verify Employee A's history is not visible. Switching accounts must not retain cached results from A.
3. Use an authorized test account with several records to verify pagination and the empty state. Test phone-width layout.
4. Use a fictional account without `strikes.self.view` and verify the page is unavailable; direct `GET /api/strikes/mine` also denies access. Do not paste cookies or tokens into GitHub or chat.
5. Record browser results in issue #100. The scripted regression only proves the server access path with in-memory data.

## Chat archive and export — authenticated Staging UAT

**Only use a disposable fictional channel.** Do not archive or clean up any real operational channel.

1. In Railway **Staging → Backend**, confirm the archive/export/cleanup flag values; the connector exposes variable names but not values. Never change Production.
2. Create a disposable channel with fictional text, one attachment, a reply, and a moderation deletion. Confirm a non-Owner cannot export archives or clean up channels.
3. Archive the test channel with an authorized account. Ensure it becomes read-only and vanishes from ordinary member lists; Owner and authorized read-only Developer archive visibility should remain.
4. As Owner, download the ZIP. Extract it offline and open `transcript.html`. Verify deleted-message markings, timestamps, message text, attachments, and `manifest.json`. Audit log should include an export-start and a completed-transfer event.
5. An incomplete/failed export must not unlock cleanup. Verify the Owner cleanup action requires a completed download and explicit confirmation.
6. **Do not click the final cleanup confirmation during this test yet.** Review the retention discrepancy below first.

## Retention decision required from XYZ

The original brief, §8.1, specifies **archive → download one standalone ZIP → Owner manually deletes**, then no copy remains in the Hub except 30-day backups. The current implementation's **Clean up channel** is a *retained-history* operation: it sets `ChatChannel.cleanedUpAt` and hides the channel from normal Chat listings while preserving its messages/files for Owners through Audit Log. The UI correctly describes this actual implementation.

These are materially different data-retention contracts. **Do not silently convert cleanup to irreversible deletion** or claim strict §8.1 completion. Get an explicit owner decision first:

- Approve current retained-history cleanup as an amended requirement, or
- Require full deletion after export, with independently verified backup/restore and explicit authorization for destructive testing.

Until a decision is recorded, keep final cleanup UAT pending. Do not delete files, purge audit events, or change production retention.

## Release boundary

No database migration, schema change, Railway variable change, production deploy, actual channel cleanup, or new paid provider is part of this test-only PR.
