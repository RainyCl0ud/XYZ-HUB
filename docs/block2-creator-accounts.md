# Block 2: Creator account connection

## Behavior

An Owner assigning the active system Creator role (`MODEL`, currently displayed as **Model** by the default role configuration) now creates a Creator Management profile automatically. This works for both invitations and an existing employee's **Edit assignments** form. Custom role names do not determine identity.

The Owner can select an existing, unlinked creator profile instead. Linking preserves its ID, display name, active/inactive status, staff assignments and QA history. Matching account and creator names never establishes ownership automatically. A name collision asks the Owner to select the intended profile explicitly.

Creator ownership is separate from staff assignments. Each login account can own one creator profile, and each profile can have one linked account. Existing staff can still be assigned to several creators through the existing assignment controls. This change does not grant Creator accounts new QA, Employee Management or Strike permissions.

The Creator role is now available in Owner invitations, where the previous ranked-role invitation rule omitted it. Other inviters cannot invite or assign Creator accounts. Creating a new profile also requires Create Creators permission; connecting an existing profile requires Edit Creators permission, including their existing permission dependencies.

Role changes/invitations and profile creation/linking commit in the same database transaction. Conflicts and permission failures leave no partial role, staff-assignment, profile or invite changes. A conditional claim and unique account constraint prevent competing requests from replacing the linked account.

## Existing accounts and lifecycle

The migration only adds a nullable, unique account connection. It does not guess existing identities, rename creators, replace assignments, or create bulk duplicates. For a legacy Creator account, open **Employee Management → account → Edit**, retain/select the Creator role, select its existing creator profile and save. If it genuinely needs a new profile, leave the automatic creation option selected.

Removing the Creator role keeps the creator profile and connection; Creator Management shows that the role was removed. Restoring the role reuses that profile. This preserves history while the wider Block 2 offboarding rules are developed. There is no account-transfer/relink operation in this slice.

Deleting a login account clears its ownership connection without deleting the creator profile or that creator's assigned staff/history. Creator catalog activation and login-account activation remain separate, as before. Existing manual **Add creator** remains available.

Owners see the linked account name, setup/deactivation status and whether it still holds the Creator role. Account emails are not added to Creator Management responses. Non-Owners do not receive linked account details or the account-linking selection list. Audit records and their readable presentation include the selected creator and before/after connection.

## Staging acceptance

Use **https://portal.xyzofm.xyz**. Production is **https://hub.xyzofm.xyz** and is outside this release.

1. As Owner, open an appropriate disposable staging account in Employee Management. Edit its assignments, select **Model** (or the configured name of the system Creator role), and leave **Creator profile** on automatic creation. Save. In Creator Management, verify one profile with that account name and its linked account information.
2. Save that account's assignments again. Confirm that no duplicate creator appears.
3. Assign a test Chatter to that creator using the normal employee controls. Confirm the assignment is available and saved. Existing multi-creator assignments should still work.
4. For a different test account, select an existing unlinked creator profile when adding the Creator role. Confirm the original creator ID, name, staff count and incident history are retained. An inactive profile should remain inactive.
5. Try to create a Creator account whose name already matches a catalog creator without selecting it. Expect a clear conflict message. Verify no partial account/role change was saved.
6. Confirm Managers and other non-Owners cannot invite/assign the Creator role or claim a creator account through a direct request.
7. Remove and restore the Creator role on a disposable account. Verify the catalog profile/history is retained and reused, with the role-removed status shown while applicable.
8. Check the Owner audit log for the creator-profile connection, then smoke-test existing login, employee, creator, QA and Strike workflows.

Invitation delivery uses the environment's configured mail provider. Use an approved staging mailbox if testing a complete invitation; the automated local checks use console delivery and reserved `.test` addresses and send no real mail.

## Developer verification

Apply migrations and bootstrap permissions/roles in an **isolated local PostgreSQL database**. Set `DATABASE_URL` to that database, `NODE_ENV=test`, console email/invitation delivery, and a local-only `TWO_FACTOR_CODE_SECRET` for the broader authentication tests.

Run the backend/frontend builds, frontend lint, `npm run test:creator-account --workspace=backend`, `npm run test:staging-regressions --workspace=backend`, and the existing People/model/access/QA/Strike/audit regression scripts. Creator-account tests refuse non-local database hosts and clean up only their own fixtures. They cover actual service transactions, authenticated HTTP requests, concurrency, readable database audit records and account deletion preservation.

An upgrade rehearsal can create legacy creator, staff-assignment and incident fixtures under the previous schema, then apply the additive migration. The creator-account tests additionally verify these optional fixtures when present.

The existing transactional-email-template test currently expects a neutral `#f5f3ee` background while the unchanged template uses the current dark design. This pre-existing assertion fails independently of creator linking; do not describe the entire aggregate Step 1 command as green.

Deploy this slice through the **staging** branch only. The staging Backend already runs migrations before deployment. Confirm successful Backend and Frontend deployments at the same commit and check `/health`. Retain the additive column when rolling application code back; removing it would discard reviewed account connections. Production release requires a separate user request.

Chat areas/channels, messaging, clock screens and trusted account-status delegation are separate upcoming Block 2 work, not implemented by this slice.
