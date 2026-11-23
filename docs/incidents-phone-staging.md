# Incidents on phones

Staging candidate, 24 November 2026. Production is outside this release.

On a 440px phone the Incidents page started its first incident about 670px down the screen, below a label, a heading, an intro, a card title, another sentence, a search box, two dropdowns and the status tabs. The table was 1,180px wide in a 394px box, so seeing whether an incident was open meant swiping across about three screens. Rainheart approved a sketch of a shorter phone layout, and this release builds it.

## What changes

**Phones (720px and below)**

From top to bottom:

1. **Log Incident:** a full-width button, for people who can log incidents.
2. **Search with a Filters button.**
   - Filters opens Chatter and Rule under the search. Tap it again to close them.
   - When either is set, the button reads "Filters · 1" (or 2) with a white border, and Clear filters resets both.
3. **Status tabs:** All, Open, Resolved and Voided, as before.
4. **One row per incident**, with three lines:
   - the chatter's name, with the status on the right
   - the rule
   - one grey line with the creator, severity and time, for example "Ava Stone · Major · Nov 22, 2026, 9:34 AM CST"
   - Status tags: Open is white, Resolved grey, Voided dim, and voided rows are dimmed.
5. **Previous, Page 1 of 3, Next**, as before, five incidents per page.

**Tap a row: the details get their own screen.**

- A bar with a back arrow, "Incident" and the status. The bar stays at the top while scrolling.
- The rule title, then the chatter's name with a QA profile link.
- One plain list: Model, Severity, Weight and Occurred.
- Details, the rule text with its version (for example "Rule (v1)"), and the evidence link or "No link added".
- Resolution notes or the void reason, when there are any, in a grey-bordered box (the desktop window keeps its faint green border for resolutions).
- The actions: the main one (Issue Strike or View Strike) full width, with Resolve and Void Incident side by side.
- For keyboard and screen-reader users:
  - The screen is a dialog named by the rule title.
  - Focus moves to Back when it opens.
  - Focus returns to the row you opened, after Back or after Resolve, Void or Log Incident closes.
  - Clear filters leaves focus on the Filters button.

**Log Incident, Resolve, Void and the confirmation step on phones**

- The same fields and steps.
- Fields are 16px, so iPhones don't zoom in when they get focus.
- Labels, helper text, summaries and error messages are 13px. Short labels (Optional, Selected rule, v1) are 11px uppercase.
- The page's notices (read-only, errors, "not available yet") and "No matching incidents" are 13px on phones too.
- Buttons and the close button are 44px.

**No longer shown on phones:**

- The "QA Records" label, the "Incidents" heading (the top bar already shows it, and screen readers still hear the heading) and the intro sentence.
- The "Incident Records" title and its sentence.
- The wide table. Weight and the rule version moved from the list into the details screen.
- On the details screen, the repeated chatter name and title, and the four separate boxes.

**Unchanged:**

- **Desktop.** Checked locally: at 1440px the page and the details window gave identical HTML before and after this change, apart from two added class names. After the review fixes, the details window still had only its class attribute and no phone markup.
- What each role can see and do. The same incidents, filters, search and actions are there.
- The "All creators" picker at the top, which every page shares.
- The read-only notice and the "not available yet" notice.

**How it's built:**

- Frontend only. No backend change, migration, flag or setting.
- One page serves both layouts. The search, filters, status tabs, Log Incident button, evidence link, resolution notes and actions are each defined once and placed by either layout.
- The phone rows and details screen are two small pieces in `components/IncidentPhoneViews.tsx`. The status names and tag classes moved to `lib/incident-status.ts`, shared by the table and the phone views.
- Crossing 720px (rotating, resizing or zooming) keeps an open details screen, an open form and what's typed in it, because all of that lives in the page.

## Verification (local)

- All 33 frontend suites, lint, the frontend build, and type checks with TypeScript 6.0.3 (as Railway builds) and 5.9.3.
- **`test:incidents-phone`** (new) renders, with fictional data:
  - **Rows:**
    - the order of name, status, rule and the grey line
    - a missing severity is skipped
    - a missing creator reads "Legacy / unassigned", as in the table
    - screen readers hear the words apart
    - each row opens its own incident
  - **Details:** the back button, status, title, chatter and QA profile, the facts, details, rule, evidence, then the actions; what names the screen; and the loading state.
  - **The page as a phone and as a desktop** (a server render, so it shows the loading state): what phones show and don't show, and that desktop keeps its header, card and toolbar.
  - **The page's code:**
    - one layout, with the shared pieces placed by each
    - the dialog markup only on phones
    - where focus goes on open, on close and after Clear filters
  - **Styles:**
    - 11px only for uppercase labels, 13px otherwise, including where site-wide 12px rules have to be beaten
    - monochrome, 44px targets and 16px fields
    - full-screen details, and a toolbar and details screen that shrink to 320px
    - nothing outside the phone block except the screen-reader class
  - Clicking through the filters and rows isn't automated (the project has no browser test library), so it was checked in the browser below.
- **Checked signed in, on a local copy.** The local frontend and API ran against an isolated loopback database with a fictional Owner account and 13 fictional incidents (open, resolved and voided).
  - At 440px, Log Incident, search, the tabs, five rows and the page buttons fit on one screen. The first incident starts at 313px, down from 670px.
  - At 320px nothing runs off the right edge, and Resolve and Void still share a row.
  - Filters: choosing a chatter showed "Filters · 1" and only that chatter's incidents; Clear filters brought everything back.
  - Details: opened from a row, back returned to the list, and every text was 13px or larger (11px uppercase labels).
  - Resolve, Log Incident and the "Log Incident?" confirmation were opened and cancelled. Nothing was saved; the incident count stayed at 13.
  - With the details open, widening to 1024px switched to the desktop window with the same incident.
  - Keyboard and focus:
    - Tab reaches each row, which shows a 2px white outline, and Enter opens it.
    - Opening focuses Back. Back returns focus to that row.
    - With Resolve open, its notes field kept focus, and Cancel returned focus to the row.
    - Clear filters left focus on Filters.
  - Error and empty text measured 13px: "Please select a chatter." and "No matching incidents".

  Staging itself was not checked signed in.

## Staging acceptance

1. On a phone, open Incidents. You see Log Incident, search with Filters, the status tabs, then the incidents as rows. No sideways scrolling.
2. Each row shows the chatter, status, rule, and creator · severity · time.
3. Tap Filters, pick a chatter: the list narrows and the button says "Filters · 1". Clear filters brings everything back.
4. Tap a row: the details fill the screen. Back returns to the list.
5. On an open incident, Resolve and Void Incident are side by side and work as before.
6. Log Incident: the fields don't zoom the screen when tapped, and logging works as before.
7. On a desktop, the page looks as before.
