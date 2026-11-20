# Chain of command for Chat channel access and Role Settings

Staging candidate, 20 November 2026. Production is outside this release.

## Rule

Outside Owners, a person may only change access for roles and people ranked **strictly below** their own highest rank (lower number = more authority). This now applies in the same way to:

- **Chat → Channel settings → Permissions.** Role grants: only roles ranked below you, never a protected system role (Ops Manager, Dev, Accountant, Model, General Staff), and never a role you hold yourself. Member grants: only people whose every role is ranked below yours. Owner access stays automatic and uneditable, and you still cannot add yourself.
- **Role Settings.** With Manage Roles, you may only create roles ranked below you, edit roles ranked below you that you do not hold, and you cannot move a role to your rank or above. Owners keep full control of every non-Owner role.

Examples with default roles: a Manager can change QC, Chatter, Trial Chatter and lower custom roles, but not the Manager role (so not other Managers' posting rights), Ops Manager or the protected roles. An Ops Manager can change Manager and below. A person holding Manager + Chatter cannot change the Chatter role, though they can still give a named grant to a Chatter.

The editable lists only offer what the server accepts, and the server re-checks every request (403 `ROLE_AUTHORITY_REQUIRED` in Role Settings; 403 in Chat). Rejected attempts write no grant and no audit event.

## What changes for people

- Channel settings show fewer roles/members for non-Owners, with a one-line note that only lower-ranked entries are listed.
- Role Settings shows **View permissions** and no **Edit** on roles above your rank or held by you; the permission editor opens read-only with an explanation. Owners see no difference.
- Existing grants are not rewritten. A grant previously set by someone who no longer qualifies stays in place until an authorised person changes it.

No schema change, migration, flag or Railway setting. Older frontends keep working: a missing `canManage` value is treated as editable, and the server still enforces the rule.

## Verification (local, loopback PostgreSQL with fictional data)

- `test:creator-chat`: 24 groups, including a new chain-of-command group covering Manager/Ops/multi-role editors, peers, protected roles, held roles, direct service and HTTP attempts, unchanged grants and no audit noise.
- `test:step1:role-builder`: 21 checks, including editability flags and rejected create/edit/promote attempts for a delegated role manager.
- Also passed: `test:standing-chat` (20), `test:chat-browser-notifications` (7), `test:access`, `test:people-access-update`, `test:step1:people-hierarchy`, `test:staging-regressions`, backend/frontend builds, frontend lint and the Chat settings/grant-copy/UI-polish frontend checks.
- `test:chat-unread-reminders` fails at its 30-minute age check (line 80) on this machine both with and without this change; it is unrelated to grants or roles.

## Staging acceptance

Integration with the latest Staging preserves inherited See/Post display, shared toasts, blue mentions and five-minute message grouping. The combined candidate passed 25 creator-chat groups, role-builder checks, protected-chat and notification checks, access/People/staging regressions, both builds, strict TypeScript, frontend lint and all 24 frontend suites. Local browser fixtures also passed the inherited Post display, toasts, desktop/mobile grouping and touch message actions. Signed-in Staging acceptance remains separate.

1. As a test Manager, open Channel settings → Permissions → Role. Only QC, Chatter, Trial Chatter and lower custom roles appear. Member list omits other Managers and protected roles.
2. As a test Ops Manager, confirm Manager appears but Ops Manager does not.
3. As Owner, confirm every non-Owner role and member is still listed and editable.
4. Give a test non-Owner Manage Roles, open Role Settings, and confirm Edit only appears on lower-ranked roles they do not hold; then remove the permission again.
