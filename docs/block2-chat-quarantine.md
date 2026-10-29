# Creator-local Chat quarantine

Rainheart confirmed on 29 October 2026: pause only the affected creator's chats; retain the person's own staff–management private chat. Login, Clock and other creators remain available. This is a staging-only rollout.

## Behavior and authority

- UI calls this **Pause creator chats**. The member list and current staff-private header offer the action only when the server authorizes it. Confirmation names the person/creator and explains the private-chat exception, unrelated creators and Clock. Both pause and lift require a reason.
- QC defaults can target Trial-only staff assigned to that creator. Managers can target Chatter/Trial staff assigned to the same creator. Ops/Owners may target those staff categories across creators, selecting one creator per action. Explicit new permissions are installed once; recurring provisioning preserves removed defaults.
- Self-target, protected/system higher roles, mixed higher roles and custom ranked roles above Chatter are excluded. Holding Chatter alongside Trial requires Chatter-level authority. Staff holding a quarantine-management capability cannot themselves be targeted as lower-authority staff.
- Lift normally requires current pause authority. Owners may clear an existing pause after unassignment, promotion or deactivation so changes cannot leave an unrecoverable record; this recovery does not permit creating a pause on a higher role. No UI action changes account status.
- A pause denies all ordinary channels and other people's private conversations for this creator, even with named grants or broad read/post permissions. Their own current staff-private chat stays usable. The private conversation gets an immutable system notice, with no team-wide announcement. A lift recalculates current permissions; it never creates assignments, restores grants or reopens an old assignment's chat.
- Current state is creator + user scoped and lasts until manually lifted. It does not silently expire on unassignment; Owner recovery or a later permitted review can lift it. Deleted accounts leave name/state/audit snapshots; the user relation becomes null and cannot restrict another account.

## Consistency and privacy

The same pause gate serves listing, member visibility, transcript/history refresh, direct links, search, replies, edits, reactions, pins and moderation. Normal team members receive no pause reason/status for another person. Authorized reviewers can still find a paused target in the member panel; paused entries are excluded from the actual member count.

Shared per-person transaction locks cover Chat reads/writes; pause/lift takes exclusive locks in stable person order. Requests already in progress finish before a pause commits; later requests reload current state. Search uses the same lock with Read Committed so an access snapshot is not taken before waiting for a pause. Existing pages clear inaccessible state at their next authenticated poll (normally 5 seconds); this batch does not introduce push/live-stream delivery or erase already viewed data.

Version + current assignment-episode checks prevent stale confirmations. Desired-state retries with the same request/payload log once; changed versions/payloads require review. State, private notice and audit commit atomically. The dialog preserves the reason after a conflict/uncertain outcome and checks current status before allowing another action. If the desired state was already reached, it offers return to chat instead of silently reversing the action.

System notices cannot be edited, replied to, reacted to, pinned or moderated through Chat. Database guards protect their text and notice state from ordinary update mistakes. Audit and notices remain in the same database; independent tamper-proof audit storage is a separate milestone.

## Deployment and verification

Migration 25 (`20261029010000_chat_quarantine`) adds a separate state table and a nullable message system-event key. It does not rewrite existing messages, roles, users, assignments or hours. The existing staging pre-deploy command applies migrations and installs the new permission defaults; commands, credentials and feature flags remain unchanged.

- `npm run test:chat-quarantine --workspace=backend`: 17 isolated integration groups for authority, privacy, current-grant restoration, notices, retries/concurrency, audit rollback, ordinary sign-in/Clock continuity, archive/transfer/promotion, HTTP contracts and retained account attribution.
- `npm run test:chat-quarantine-upgrade --workspace=backend`: fresh named local database only, actual 24→25 upgrade with old messages/replies/reactions/pins/custom names/assignments/private chats/hours preserved and new pause flow exercised. Never resets a database.
- Existing Chat suites (82 groups), Clock/alerts/corrections (51 groups), Role Builder (19 checks), staging-target guard and actual frontend message rendering checks passed locally during this batch. Build/lint and browser results belong in the final release checkpoint.

## Staging walkthrough

Use fictional test accounts at `https://portal.xyzofm.xyz/chat`.

1. Assigned Manager: Members → test Chatter → Pause chats. Confirm the person/creator, try Cancel, then submit a reason.
2. Affected staff: refresh/open Chat. Only their management private chat remains for that creator; send a test message there. Their other creator remains usable. Clock & Hours remains accessible.
3. Manager: open the person's private chat → Review / lift chat pause. Confirm a reason and lift. Staff refreshes and sees only currently permitted channels.
4. QC: repeat for a Trial test account; Chatter/higher-role targets must have no pause action. An unrelated Manager must have no action for this creator.
5. Phone: review both confirmation states, required reason, keyboard focus, Cancel, success and re-entry. No horizontal overflow.

Production rollout and final user acceptance are separate; local checks do not establish user acceptance.

## Recovery

Keep the additive migration and retained records when rolling forward or fixing the UI. A backend from before this feature does not enforce quarantine, so do not roll back to that backend with Chat enabled while pauses exist. Prefer a forward fix; if reverting is necessary, disable Chat on staging until quarantine-aware enforcement is back. Clock and login use separate gates. Do not revert the database or clear pause/audit records as a rollback shortcut.
