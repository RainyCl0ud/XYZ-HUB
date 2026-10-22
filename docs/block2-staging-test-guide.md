# Block 2 chat — staging setup and test guide

This release is the first testable chat batch: ordinary channels, protected private chats, text messages/editing, membership and channel settings. The clock, files/voice, notifications, quarantine, search/replies/reactions/pins and channel deletion/export are not included yet. Production must remain on its current main-branch release.

## Railway setup

Rainheart confirmed that both Staging services use the `staging` GitHub branch and the Backend references Staging's own Postgres service. Keep the environment selector on **Staging** throughout. Do not change DATABASE_URL or credentials for this rollout.

1. Wait until the chat release is merged into the GitHub `staging` branch. Automatic deployments may initially keep Chat hidden because flags are off by default.
2. Open **Staging → Backend → Settings**. Keep Build Command as `npm run build:backend` and Start Command as `npm run start --workspace=backend`. Replace only Pre-deploy Command with:

   ```
   npm run chat:prepare-staging --workspace=backend
   ```

3. In **Staging → Backend → Variables**, set `BLOCK2_CHAT_ENABLED` to `true`. Use database audit storage (`AUDIT_STORE_MODE=database`) for the Owner's chat audit records; it is already the required production-mode default unless explicitly overridden. Do not copy or expose credentials. Apply the staging changes and wait for Backend deployment success.
4. Expected pre-deploy logs: `Confirmed XYZ Hub Staging`, database migrations applied or none pending, then `Provisioning complete`. Existing creators and people get missing channels/private chats without changing their accounts or assignments. Re-deploying preserves edited grants and conversation history. A wrong environment/project fails before any migration.
5. Open **Staging → Frontend → Variables**. Set `VITE_BLOCK2_CHAT_ENABLED` to `true`, then deploy/rebuild the Frontend. This is a build-time flag, so a restart alone does not enable the Chat route.
6. Open the Staging website, refresh once and sign in as Owner. The sidebar should contain **Chat**. If it does not, confirm that both successful deployments use the latest staging commit and the flags are on the correct services.

No reset command is part of this release. Do not run the staging test-data reset to activate chat.

## Test accounts and expected access

Use made-up people and test creators on Staging. Invitations can use email aliases you control so setup and sign-in codes reach you; do not change real staff roles just to test. Creator login accounts must be explicitly linked to the intended creator through the existing invitation/access editor, preserving existing creator records.

| Account | Ordinary creator channels by default | Private chats |
| --- | --- | --- |
| Owner | Every creator/channel; can post | Creator, staff, accountant and General Staff chats |
| Ops | Every creator/channel; can post | Creator, staff and accountant; no General Staff private chats |
| Manager | Thirteen per assigned creator | Assigned creator's chat and staff private chats |
| QC | Thirteen per assigned creator | Assigned staff private chats; no creator-private chat |
| Chatter | Nine per assigned creator | Own private chat for each assignment |
| Trial Chatter | General, Updates, Trial feedback | Own private chat for each assignment |
| Creator only | None | Exactly her linked creator-private chat |
| Accountant only | None | Personal accountant chat outside creator areas |
| General Staff only | None | Personal chat with Owners |
| Developer | All ordinary channels, read-only | Creator/staff/accountant chats and archives, read-only; no General Staff private chats |

Custom roles start without access. An ordinary-channel custom role needs Chat access, ordinary-channel access, any allowed actions, and channel grants. Holding QC and Chatter together provides QC review authority, including Trial feedback.

## What to test

1. **Creator account:** invite a test Creator or add Creator role to a test account. Verify the linked Creator Management record and sign in with it. It should see one protected private chat, with the creator, current Managers, Ops/Owners and Developer read oversight. QC/Chatter accounts must not see or open it. There must be no channel-settings control in that private chat.
2. **Default channels:** compare a Chatter and Trial account against the table. A Chatter must never see Trial feedback unless that same person also has QC/Manager-equivalent review authority. Switching teams alone must not change chat membership.
3. **Multiple creators:** assign one Chatter to two test creators. Both areas and separate personal private chats should appear. A third creator must remain hidden.
4. **Messaging:** send and edit a message, refresh and confirm it persists. Another person cannot edit it. Developer sees a read-only notice and no composer. New messages/member changes currently refresh by polling, normally within five seconds; refresh the page if necessary while testing.
5. **Channel controls:** as Owner/assigned Manager, add a channel, rename it and give Chatter role “See only.” Verify visibility without posting. Add a named “See and post” grant and verify posting. Remove the named grant and confirm role-based read-only access remains. Unassigned people and self-additions must be unavailable. Private-chat membership cannot be changed this way.
6. **Transfer and return:** put a distinctive message in a Chatter's private chat, unassign the person, then reassign them. All old-creator access should close when removed. Their returning private chat should be empty and new; Owner/Developer can read the archived old conversation, but current QCs/Managers cannot inherit it. The other assigned creator remains accessible.
7. **Manager movement:** move a test Manager off the creator. Their creator-private and staff-private access must close. Add the Manager back and verify current permitted membership.
8. **Role exceptions:** verify Accountant receives no operations channels, General Staff private chat is staff+Owners only, and Developer cannot post. Confirm QC coaching/resolution notes in the existing incident screen still work normally.
9. **Owner audit:** edit a test message and open the Owner Audit Log. The “Chat message edited” entry should show original and changed text. Chat records are retained in the database; this release does not yet provide independent protection against an administrator rewriting the database.
10. **Existing workflow:** check existing creator assignments, QA incidents/coaching and strikes. This rollout should not change their records, scopes or deactivation rules. Test on a phone as well: channels collapse, controls remain usable and there is no sideways page overflow.

If a deployment fails, keep the previous working staging deployment and share the error text with Rainheart's development chat, without secrets. Do not restore a database backup or delete data to fix a failed additive migration. If needed, hide Chat by disabling the Frontend flag and rebuilding; leave the additive chat tables and data intact while investigating. The staging pre-deploy guard intentionally refuses Backend startup preparation when its enabled flag is false, so disabling Backend as well requires restoring the old migration-only pre-deploy command for that deployment. Production stays untouched.
