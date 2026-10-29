# Block 2 — Message moderation and retained history

## Behavior and access

Assigned Managers, Ops and Owners receive the explicit `chat.messages.moderate` permission once. They can delete any message in an active conversation they can currently access, including their own or a higher role's message. Posting permission is separate. Ordinary authors can edit their messages but cannot delete them merely because they wrote them. General Staff private conversations remain limited to their subject and Owners; moderation never bypasses protected rosters or creator assignments.

Delete opens a confirmation showing the selected text and requires a reason. The decision includes the reviewed message version: an intervening edit requires a fresh review. Deletion removes the message from non-Owner transcripts, search, direct links, refresh batches and pins. Replies remain but their source preview becomes **Original message unavailable**. A deleted source cannot receive a new reply, edit, reaction or pin. Existing reactions are retained for Owner reading; a current pin is removed atomically.

Only an active system Owner membership permits retained deleted content or full message history. This is a server-side boundary, not a configurable permission: Developer, Ops, Manager, author, deleting moderator and broad-scope custom roles cannot read retained content. Owners see the deleted message in place and in **Deleted messages**, marked **Deleted · Owner view**, with original author, full text, deletion time, moderator and reason. **View history** shows the original send and full before/after edits as well as deletion. Existing current conversation access is still required. Archived conversations remain read-only.

The later agency styling instruction takes precedence over the original brief's red deletion styling. Deleted content uses the XYZ monochrome palette, a white border and explicit text labels. Dialogs retain keyboard focus and use phone-friendly controls. No restoration or permanent-purge control is included.

## Integrity and limits

Migration `20261028010000_chat_message_moderation` adds four nullable deletion fields and scoped indexes. Existing rows keep their text, timestamps, versions, reply targets, reactions and pins. Deletion records its full audit event in the same transaction; audit failure rolls the whole operation back. Scoped row locks serialize moderation with edits, reactions, pins and reply creation. Retried deletion audits once and returns no retained text to non-Owners. Database constraints reject incomplete deletion state and repinning deleted content; a trigger rejects rewriting retained content or removing its deletion metadata. Account removal can null foreign keys while name snapshots remain.

These protections operate within the application/database. They are not an independently stored, tamper-proof audit archive; database administrators still control the database. Separate retained backups/storage and archive/cleanup/export are later work. The app cannot erase text someone already read or copied. Open transcripts and tool dialogs refresh; denied access clears their content, while a temporary disconnected browser cannot receive a deletion until it reconnects.

## Validation

- Backend build and staging-check TypeScript compilation; frontend build and lint.
- **19 moderation integration groups**: default/custom/removed role permissions, protected rosters, hard Owner visibility across every API surface, full revisions, strict payloads, required reasons, version conflicts, edit/delete/reply races, duplicate deletes, pin cleanup, audit rollback, database guards, bounded pagination, authenticated no-store HTTP, feature gating, archive freeze and account/name retention.
- Existing creator Chat 22, standing/private Chat 18, interactions 23, Clock 18, attendance alerts 15, corrections 18, Role Builder 19 and audit presentation 6 checks passed. Staging access and in-memory reset-adapter regressions passed; no real staging reset ran.
- Real message-component rendering checks cover previous API responses, Owner read-only deleted content, redacted replies and distinct moderation/history controls.
- Fresh loopback upgrade rehearsal used the actual guarded pre-deploy to move 23 → 24 migrations. Existing chats/replies/reactions/pins, custom grants/names, users/sessions/assignments, QA/strikes, Clock hours/breaks and a pending correction were unchanged. Repeat pre-deploy neither duplicated defaults nor restored a deliberately removed moderation grant.
- Browser walkthrough with disposable local Manager and Owner accounts: required reason and focused input, Cancel without change, confirmed deletion, immediate non-Owner removal/reply redaction, Owner retained list and full send/edit/delete history. Inspected the confirmation at 320px and history at 390px; no page-wide horizontal overflow. Screenshots were saved outside the repository. This is local verification, not a claim of staging user acceptance.

## Staging rollout

Use only Staging with its existing Postgres reference and feature flags. Keep build `npm run build:backend`, pre-deploy `npm run chat:prepare-staging --workspace=backend` and start `npm run start --workspace=backend`. The existing guarded pre-deploy installs the additive migration and one-time permission defaults. No seed, reset, database recreation, Production command or Production rollout is part of this release.

After both staging deployments succeed, use disposable staging accounts to confirm:

1. Staff have no Delete control. An assigned Manager can cancel deletion without change, then delete a test message with a reason.
2. From staff and Manager accounts, it disappears after refresh and cannot be found in search or pins; replies show the unavailable-source marker.
3. An Owner sees the retained message, deletion attribution/reason and full send/edit/delete history. Developer and other non-Owners cannot see those screens or retained text.
4. Repeating the action or editing the source from another account does not duplicate deletion or silently delete a newer edit. Check phone layout and ordinary sending/replying afterward.

These new staging acceptance checks remain pending until actually confirmed. The previous 19-item Chat tools and Clock walkthrough was already user-confirmed complete on October 28; it is not reopened by this release.
