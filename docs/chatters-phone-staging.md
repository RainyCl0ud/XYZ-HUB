# Chatters on phones, without Add Chatter

Staging candidate, 24 November 2026. Production is outside this release.

On a 440px phone the Chatters page showed a label, a heading, an intro, an Add Chatter button, a card title and sentence, and a search box before any chatter. The table's Status and Added columns sat behind a sideways scrollbar. The list kept a fixed height, which left an empty block under a short list, and every row repeated "View QA incident history".

Rainheart approved a shorter phone layout, with one change: the creator picker and the search share one line, search 70% and the picker 30%. Rainheart also agreed to remove Add Chatter.

## What changes

**Phones (720px and below)**

From top to bottom:

1. **Search and the creator picker on one line.**
   - Search takes 70% of the line and the picker the rest.
   - It's the same picker as in the top bar, with the same choices and saved choice, drawn beside the search instead. The top bar loses its second row on this page, so the list starts higher.
   - Without a picker to show (for example, someone with no creators to choose from), search fills the line.
2. **Status tabs:** All, Active and Inactive, as before.
3. **One row per chatter:**
   - their name, then when they were added, for example "Added Oct 12, 2026"
   - an Inactive tag only when it applies, and the row is dimmed
   - an arrow; the whole row opens the chatter's QA profile
4. **Previous, Page 1 of 2, Next**, as before, seven chatters per page.

Search and the picker are 44px tall with 16px text, so iPhones don't zoom in when they get focus. The picker shows "All creators" in full on a 440px phone. On narrower phones a long name is shortened, and the full name shows when it's tapped.

**No longer shown on phones:** the "Team Management" label, the "Chatters" heading (the top bar shows it, and screen readers still hear the heading), the intro, the "Chatter Records" title and sentence, the table and its sideways scrollbar, and the repeated "View QA incident history".

**Add Chatter is removed, on every screen size.**

- Chatters already come from People: giving someone the Chatter or Trial Chatter role creates their chatter record and keeps its name and Active/Inactive status in step.
- Add Chatter made a record with only a name and no person behind it. That record:
  - couldn't receive a strike, because Issue Strike needs a linked person
  - wasn't in any creator's roster, so Managers and QC, who see only their creators, never saw it
  - could only be joined to a real person with a developer script
- If the same person was later added in People, a second, linked record was created rather than matched, and incidents logged against the first never showed in their history.
- The server no longer creates name-only chatters either. It answers "Chatters are added in People. Give the person the Chatter or Trial Chatter role." (HTTP 405).
- An empty list now says "Chatters appear here once someone in People has the Chatter or Trial Chatter role." With a status filter on, it says "Try another status filter."
- Name-only chatters that already exist stay as they are, with their history.

**Unchanged:**

- **Desktop**, apart from Add Chatter and the empty-list sentence. The creator picker stays in the top bar.
- Every other page: the creator picker stays in the top bar on Incidents, Rules and the Dashboard.
- QA profiles, renaming and deactivating chatters, and who can see what.

**How it's built:**

- The top bar's creator picker is defined once. A page can offer a place for it (`lib/model-picker-slot.ts`); Chatters does so only on phones, and the top bar then draws the picker there and drops its second row. Switching creators keeps working as before (the page reloads for the new creator, and the picker stays in place).
- The phone rows are `components/ChatterPhoneList.tsx`, each a link to the same profile address the table opens.
- Backend: the old create handler in `routes/chatters.ts` is removed, and `routes/qa-chatters.ts` answers POST `/api/chatters` with 405.

## Verification (local)

- All 34 frontend suites, lint, the frontend build, and type checks with TypeScript 6.0.3 (as Railway builds) and 5.9.3.
- **`test:chatters-phone`** (new) renders, with fictional data:
  - **Rows:** name and when added, the Inactive tag only when it applies, the arrow, and links to the QA profile.
  - **The page as a phone and as a desktop** (a server render, so it shows the loading state): search and the picker's place on one line, the tabs, what phones don't show; desktop keeps its header and card; no Add Chatter anywhere.
  - **The code:** one creator picker, drawn in the page only on phones, with the top bar a row shorter; Add Chatter gone from the page and the API.
  - **Styles:** search 70% and the picker 30%, search filling the line without a picker, 44px targets, 16px fields, 11px only for uppercase labels and 13px otherwise, monochrome, and nothing outside the phone block except the screen-reader class.
- **`test:header-redesign`** now finds the picker in its shared constant and checks the top bar still draws it.
- Backend, against the isolated loopback database:
  - `test-step1-qa-route-scope` gained a check that POST `/api/chatters` returns 405 for an Owner and a Manager and creates nothing.
  - It passes, along with `test-legacy-chatter-link` and `test-current-chatter-identity`.
  - Both TypeScript versions pass.
- **Checked signed in, on a local copy** with a fictional Owner account, four People-linked chatters and six fictional name-only ones.
  - At 440px:
    - The top bar is one row, and search and picker share a line: 284px and 114px, 70% of the line.
    - "All creators" fits.
    - The first chatter starts at 215px.
  - Choosing a creator from the picker narrowed the list to that creator's chatters, saved the choice, and kept the picker beside the search.
  - Incidents still shows the picker in the top bar's second row.
  - At 320px nothing runs past the right edge (search 200px, picker 78px).
  - At 1440px the picker is in the top bar, the table is unchanged, and there is no Add Chatter button.

  Staging itself was not checked signed in.

## Staging acceptance

1. On a phone, open Chatters. The top bar is one row. Search and the creator picker share a line, then the status tabs, then the chatters as rows. No sideways scrolling.
2. Pick a creator from the picker beside the search: the list narrows to that creator's chatters.
3. Tap a chatter: their QA profile opens.
4. There is no Add Chatter button, on a phone or a desktop.
5. Give a test person the Chatter role in People: they appear in Chatters.
6. On a desktop, the page looks as before, minus Add Chatter.
