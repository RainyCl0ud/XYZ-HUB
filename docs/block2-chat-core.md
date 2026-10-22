# Block 2 — ordinary creator chat, first local slice

Status: staging release candidate for text chat, protected standing chats and channel controls. Activation is deliberate and limited to the approved staging environment. This is not the complete Block 2 release and does not authorize a production deployment.

## Working scope

- Additive database migration: creator chat areas, thirteen ordinary channels, role grants, assignment-bound named grants, durable text messages and a one-time setup marker. No existing record is rewritten by the migration.
- Existing and new creators can receive the thirteen starter channels. New creator catalog entries and Creator-account links provision them in the same transaction when chat is enabled. Re-running provisioning preserves edited names/grants and does not create duplicates.
- Starter visibility: Chatter nine channels; Trial three; QC and Manager thirteen. Managers see all ordinary channels in their assigned areas. Owner/Ops can post throughout; Developer reads throughout without default posting. Archived areas are frozen and default archive reading is Owner/Developer only.
- Multiple creator assignments are supported. Existing Employee, QA and Strike scopes are not changed. Chat does not reuse broad team data scope or QA historical visibility.
- Runtime decisions use configurable permissions and actual channel grants. System-role keys are used only to install initial defaults. New custom roles get no chat access automatically. Chatter's Trial-feedback restriction beats named grants; explicitly configured review authority (QC and above by default) takes priority for combined roles.
- Named grants reference the current assignment record. Removing that assignment cascades those grants; a later assignment does not restore them. Every API request reads current active-account, role and assignment state.
- Authenticated APIs list only visible areas/channels and their actual members; no staff email directory. Hidden and missing channel IDs return the same 404. Grant management rejects self-additions and people outside the creator's assignments.
- Paginated text messages, retry-safe sending, author-only edits with version checks, and database audit writes in the same transaction as each message mutation. Audit stores complete original and edited text. Account deletion retains messages and author-name snapshots. This does not make the database tamper-proof against an administrator.
- First responsive Chat page: creator/channel list, transcript, member list, send/edit controls and Central-time display. The channel list collapses on narrow screens. Updates currently use authenticated polling every five seconds, not a finished push/live-event system.
- Protected creator chats use a separate conversation model with no role/person grant relation. Creator-only accounts see exactly their linked creator chat; current Managers/Ops/Owners join it and Developer reads it. QCs/Chatters cannot gain entry through channel settings. Ordinary operations also require a separate permission that Creator/Accountant/General Staff defaults do not receive.
- Staff private chats are bound to assignment episodes. Current QCs/Managers participate; departure archives the old conversation, removes current staff access to it and creates a fresh conversation on return. Frozen archives are Owner/Developer only. Accountants receive a personal chat outside creator operations. General Staff chats are limited to the subject and Owners, with an intrinsic Owner boundary that rejects stale/custom oversight grants.
- Owner/Manager channel controls create and rename ordinary channels and configure separate see/post grants for roles and assigned people. Protected chats have no such controls. Owner Audit Log presentation includes complete original/edited message text.

## Deliberate activation

Both feature flags default to off:

```
# Backend (runtime)
BLOCK2_CHAT_ENABLED=false
# Frontend (build time)
VITE_BLOCK2_CHAT_ENABLED=false
```

Use the step-by-step [staging test guide](block2-staging-test-guide.md). The Staging Backend pre-deploy command is `npm run chat:prepare-staging --workspace=backend`. It verifies the project/environment IDs and enabled Backend flag **before** running the existing database migration command, then installs chat defaults once and provisions missing ordinary/private conversations. Wrong targets fail before migrations. The unchanged build/start commands remain `npm run build:backend` and `npm run start --workspace=backend`.

For isolated local testing, `npm run chat:provision --workspace=backend` previews setup and `-- --apply` applies it. The standalone command also refuses Production. Staging uses the stricter guarded pre-deploy path. No staging reset, account reset or credential change is needed for this rollout.

Default permissions are installed once, separately from ordinary startup. Re-running installation does not restore permissions removed by management. Newly created default roles on a pre-existing installation need explicit configuration; provisioning intentionally does not silently re-grant their permissions.

The staging reset utility clears disposable chat records before creator foreign keys and resets the setup marker when rebuilding role defaults. Its existing production refusal and protected Owner checks remain in force. Never run the staging reset against production.

## Validation

`npm run test:creator-chat --workspace=backend` requires a loopback database and exercises real PostgreSQL, authenticated HTTP, permission changes, assignment removal/reassignment, concurrent edits, retry behaviour, pagination and preservation of existing QA/Strike records. Strict staging TypeScript checks include the provisioning command and integration test.

Local validation on 22 October 2026: 22 new chat integration checks passed; all 16 creator-account checks passed; existing staging access/reset regressions, access-control and creator-management tests passed. Backend/frontend builds, strict staging TypeScript and frontend lint passed. Browser checks covered send/edit persistence, Chatter/Trial visibility, Developer read-only access, member lists, desktop layout, and the 390-pixel channel drawer with no horizontal overflow. This is local evidence, not a staging acceptance test or a production-readiness claim.

Release-candidate validation adds protected-chat, channel-management, readable audit and staging-target tests. A fresh upgrade rehearsal runs the actual guarded pre-deploy command against the prior seventeen-migration schema with fake accounts, sessions, creator links, assignments, QA/coaching, strikes, ladder and audit data. Those original records must compare exactly unchanged after setup. All test data and connections are local. Browser checks include ordinary-channel creation/rename/grants and a Creator-only login posting to her protected chat with the permitted member list visible.

## Still to build before the full chat release

Moderation/deleted-message Owner visibility; search, replies, reactions and pins; attachments/voice notes and secure file delivery; push events and notifications; quarantine; all-staff announcements; archive/export/cleanup controls; scheduled database/file backups and independent audit integrity controls. Ordinary channel grants must never be reused to authorize a protected creator private chat.

Announcement email content still needs Dim's answer. Multi-creator clock attribution and General Staff private-chat edge cases remain outside this slice. Existing hours/strikes and account-deactivation authority are not changed here.
