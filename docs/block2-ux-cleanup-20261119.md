# Block 2 UI and UX cleanup — 19 November 2026

Implemented locally, ready for a staging release. No deployment was made in this task.

## Source verified first

GitHub staging was `2b80c097740419f85b8417f626feabfc51a269cb` (PR #128). GitHub comparison confirmed its source files match local source commit `41174fcf02ffae78f95347387e2ff33a6279cdc3`, tree `f588526611f4c0cf480a7fc2a8ecf971235d0033`. Changes were made in an isolated workspace snapshot. The older Block 2 working copies and the Desktop checkout were preserved.

## Delivered

1. Moved the account notification switch and advanced settings to the right side of the My Account heading. They wrap within the header on small screens.
2. Replaced personal strike cards with a table, expandable details, a dedicated empty state, and seven records per page. Existing server pagination and own-record permission checks remain in place.
3. Anchored the emoji picker six pixels above or below its actual trigger. Removed the assumed 350-pixel height that displaced the compact Recent picker. The library expands from the same anchor.
4. Extended the opaque sticky message-search header across the full padded scrollport so results cannot bleed above or beside it.
5. Added current, non-archived role names to the scoped Not clocked in roster.
6. Removed the duplicate full-snapshot table from correction details. Requested Changes remains the single comparison, hiding unchanged breaks. Stored before/requested snapshots and decision history remain intact.
7. Removed Refresh overview. Successful clock writes notify connected overview browsers immediately through a content-free event stream. Every refresh uses the normal authenticated and scoped API. Five-second visible-tab polling and focus/reconnect refresh provide recovery and cross-replica fallback. Like the existing Chat stream, immediate events operate within one Backend replica. Multiple replicas would require a shared event transport for immediate cross-replica delivery.
8. Added searchable recipient checkboxes in announcement review, with removal, addition and Select all staff. Every audience change clears confirmation and generates a fresh server preview. Selection is bound to preview tokens and idempotency keys. Only selected staff receive email/private copies or see the announcement in shared channels, direct links, refresh and search. Authors retain access to their posts, and Owners retain audit access. Current channel permissions still apply. Only Updates channels needed by selected recipients are posted to when using a custom audience. Private-only accountant/general-staff selections are supported.
9. Removed conversation search from Channels and Private. Kept the Unread only filter and all message-search controls.
10. Added an Owner-only Cleaned-up Chat channels directory directly in Audit Log, with links to retained messages, message edit history and files. It is paginated independently of the existing bounded Audit event list. The older event-detail link is preserved. Non-Owner directory requests are rejected by the Backend.

## Verification

- Backend and frontend builds passed. Frontend lint and whitespace checks passed. Vite retains its existing large-main-bundle advisory.
- Applied all 36 migrations to a newly created local database on loopback port 55494, including the new announcement-post/message foreign key.
- Announcement integration: 16 groups passed, including recipient exclusion through direct reads, read acknowledgements, refresh, search, notifications, shared channels, private copies and email delivery records. Also tested stale previews, changed selections, replay protection, concurrent publication and Owner-only retained directory access. No provider email was sent.
- Existing unread integration: 11 groups passed, including per-person reads, cutoff handling, concurrent tabs, late commits, role revocation and private access.
- Attendance role ladder: eight groups passed, with role names asserted in the roster. Fixed an existing test expectation that overlooked the custom-role fixture remaining off shift.
- Live attendance: authenticated HTTP test verified unauthorized denial and an immediate signal to a second signed-in browser after clock-in, followed by the updated scoped roster.
- Personal strikes: six existing acceptance-guard groups passed with the page boundary updated to seven.
- Correction comparison: seven groups passed. Correction form UX: four groups passed. Owner workspace: four groups passed. Emoji picker: nine groups passed. Search-panel UX: eight groups passed. Announcements UI: twelve groups passed.
- Chrome browser checks used fictional API fixtures for desktop and mobile layouts. Verified actual table pagination, empty state, header placement, search header coverage after scrolling, picker distance, removal/addition of recipients, and no viewport overflow or browser runtime errors. Screenshots are in `outputs/hub-ux-20261119` in the parent task workspace. These are local visual checks, not a live staging acceptance walkthrough.

## Staging rollout

Deploy Backend and Frontend together with migration `20261119010000_announcement_recipient_visibility`. The new Prisma relation uses the already-existing announcement-post message IDs. Before rollout, check existing announcement posts for dangling message IDs because the foreign key deliberately rejects inconsistent data. The normal migration command applies this constraint without deleting records.

Keep the current staging delivery modes and feature flags. Recheck the two-browser overview update, recipient privacy, My Strikes pagination and retained-channel link on staging before release sign-off.
