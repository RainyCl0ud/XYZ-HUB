# Audit Log tabs

Staging candidate, 21 November 2026. Production is outside this release. Follows `docs/email-delivery-staging.md`.

## What changes

- **Tabs keep the log first.** The Audit Log page now has **Activity** (the log, shown by default), and for Owners **Email delivery** and **Cleaned-up channels**. Before, the two Owner sections were stacked above the log and pushed it below the fold.
- **The Email delivery tab shows "!"** with a count when something needs attention (or just "!" for a sending problem), so it can't be missed while you're on Activity. Email notices in the bell open this tab (`/audit?tab=email`; older `#email-delivery` links still work).
- **One Refresh button** in the page header refreshes whichever tab is open. The extra Refresh buttons inside the sections are gone.
- **Proper spacing.** Each tab's content sits in one padded card instead of edge-to-edge cards touching each other.
- **Clearer reminder rows in the log.** "Unread reminder email" rows now read "To Sarah Miller · 14 unread · Preview saved", with the person in the Affected column instead of "Chat". Resume and handled actions read "Reminder emails resumed for ‹name›." and "Announcement email for ‹name› marked handled."
- The tab is kept in the address bar, and keyboard users can move between tabs with the arrow keys, Home and End.

Frontend and audit-display changes only: no migration, flag or Railway setting.

## Verification (local)

- `test:email-delivery` (6) now also checks the new reminder and resolve row summaries and Affected names.
- Also passed: `test:hub-notifications` (9), the audit presentation and audit database suites, backend and frontend builds, frontend lint, and all 25 frontend suites. `test:notification-bell` covers the tab order, the Owner-only Email delivery tab, the single Refresh, the legacy link, and the bell's new link.
- I couldn't view the page in a local browser: the browser-test tool (Playwright) isn't installed on this machine. Check the layout on Staging using the steps below.

## Staging acceptance

1. As the Owner, open **Audit Log**. **Activity** is selected, and the search bar and log sit right under the tabs.
2. Open **Email delivery**: one padded card with the "Preview mode" status and "Nothing needs attention". Open **Cleaned-up channels**: its description and "No channels have been cleaned up."
3. Press **Refresh** on each tab: only that tab reloads.
4. In **Activity**, find an "Unread reminder email" row. It reads "To ‹name› · N unread · Preview saved", with that person under Affected.
5. On a phone-width window, the tabs fit or scroll sideways without breaking the page.
