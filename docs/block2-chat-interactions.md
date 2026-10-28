# Block 2 — Replies, reactions, pins and message search

## Behavior

- Reply to a message in the same conversation. The composer shows the selected message and a Cancel reply action. Replies keep their original target; the preview reflects edits to that target and opens an authorized message detail.
- Add or remove your own reaction using 👍, ❤️, 😂, 🎉, 👀 or ✅. Repeating an add/remove request does not change the count twice. Reactions schedule no email or push delivery.
- Pin useful messages and read them from **Pinned messages**. The new `chat.messages.pin` permission is installed once for Owner, Ops Manager and Manager. It also requires current posting access to that conversation. Existing role/channel customizations stay in place; later removal of the pin permission is not undone by a redeploy.
- Search message text in the current conversation or **All my conversations**, using 2–120 characters. Matching is case-insensitive and treats `%`, `_` and backslash literally. Results show the workspace, conversation, author and Central timestamp, then open the current message. Search returns 25 results per page, with no global or hidden-result count.

All reads and writes use current account status, configured permissions, creator assignments, ordinary channel grants and protected private-chat membership. General Staff private chats remain limited to the subject and Owners. Returning staff cannot search a previous private-chat episode. Permitted archive readers can search and view pins; archived conversations remain read-only. Authors retain their existing editing rights.

The transcript continues its five-second refresh, including bounded refresh batches for older loaded messages. Open message/pin dialogs also refresh. Search refresh begins at fifteen seconds and slows as more pages are loaded to respect request limits. These controls use the existing polling foundation; this release does not introduce a live event stream, attachments or moderation/deletion.

The UI follows the XYZ monochrome kit, labels actions in text, uses native focus-trapped dialogs and supports narrow phone screens. Reaction emoji are message content.

## Data and audit

Migration `20261028000000_chat_interactions` adds nullable reply/pin fields, a pin version and the reaction table. Existing message text, timestamps and versions are retained. Database constraints prevent cross-conversation replies, self-replies and reassignment of a recorded reply target. Deleting an account preserves message and pin name snapshots; its reactions are removed.

Reply sends and actual reaction/pin changes write an audit event in the same transaction. Message locks serialize reaction and pin changes. Pin updates include a version check so an old unpin/pin decision cannot overwrite a newer change. Retry requests whose desired state is already present return that state without duplicate audit entries.

## Validation completed locally — October 28, 2026

- Backend build, frontend build, frontend lint and staging-check TypeScript compilation.
- **23 Chat interaction integration groups**: reply target/nonce isolation, database reply constraints, edited previews, reaction concurrency/retries, bounded palette, pin authority/versioning, current access changes, protected and archived search, literal matching, stable pagination, old-history refresh, audit rollback, real authenticated HTTP mutations, strict validation, no-store responses, rate limits, feature gating, deactivation and name retention. Existing QA/strike/attendance/correction counts are unchanged.
- Existing regression suites: creator Chat **22**, standing/private Chat **18**, Clock **18**, attendance alerts **15**, Clock corrections **18**, Role Builder **19**, audit presentation **6**; staging access/reset adapter checks also pass. The reset adapter uses fake in-memory data; no live reset command was run.
- A fresh local rehearsal ran the **actual guarded staging pre-deploy command** from the previous 22 migrations to 23. Existing messages, names, grants, accounts, sessions, creator assignments, shifts, breaks and a valid pending correction were retained. A second deploy added no duplicates and did not restore a removed pin grant.
- Browser walkthrough using made-up local staff and Manager logins: reply send/context, add reaction, search and open a result, reply from the result with composer focus, Manager pin/unpin/repin and pin list. Search input receives keyboard focus. Desktop, 390px and 320px layouts inspected; no page-wide horizontal overflow observed. Browser error log was empty.

The frontend build retains the existing warning about the main application bundle exceeding 500 kB; this Chat page remains a separate lazy-loaded chunk.

## Staging rollout and acceptance

Target **staging only**. Keep the existing Railway commands, feature flags and Staging Postgres reference:

```text
Build:      npm run build:backend
Pre-deploy: npm run chat:prepare-staging --workspace=backend
Start:      npm run start --workspace=backend
```

The existing guarded pre-deploy applies the additive migration and installs the new pin default once. No reset, seed, database recreation or Production change is part of this rollout. Take/retain a current Staging backup before applying migrations. If a build fails, inspect the failed attempt's logs; the green Active attempt may belong to the previous deployment.

After both Staging services deploy successfully:

1. With a test staff login, send a reply, reload, and open its original message. Add the same reaction twice, then remove it; the count must remain correct. Staff should have no Pin action by default.
2. With an assigned test Manager, pin/unpin a message and check the list from the test staff login. A Manager assigned elsewhere must not reach this conversation or its pins.
3. Search in the conversation and all permitted conversations. Open a result, reply to it, and verify the destination. Repeat a private phrase from a non-member login: neither the text nor a hidden result count should appear.
4. Check a phone-size screen and older loaded history after another person edits, reacts or pins. The selected channel's posting and pin controls must follow current permissions.

**Staging acceptance is pending until those deployed-build checks are confirmed.** The separate Clock correction approval walkthrough also remains pending: the submitted QC test request was seen Awaiting review; a completed Manager approval has not yet been confirmed.
