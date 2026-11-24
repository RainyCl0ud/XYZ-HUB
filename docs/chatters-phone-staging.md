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

Search is 44px tall with 16px text, so iPhones don't zoom in when it gets focus.

**The creator box (second pass, 24 November).** On Staging, a 375px phone showed "All cre…", cut mid-word: "All creators" at 16px didn't fit in 30% of the line. The box now shows:

- a small "CREATOR" label (11px uppercase) on top
- the choice underneath at 13px: "All", or the creator's name; a long name ends in "…" instead of being cut mid-letter

Tapping anywhere on the 44px box, border included, opens the phone's own list with the full names ("All creators", "Ava Stone" and so on). The real menu lies over the box, invisible, and stays 16px, so iPhones still don't zoom in.

- **Arrow:** beside the choice.
- **Keyboard focus:** a 2px white outline around the box, including in older browsers.
- **Screen readers:** they hear "Creator" and the full name of the choice.
- **Inactive creator:** the small label reads "INACTIVE" instead of "CREATOR", because a narrow box would cut "(Inactive)" off the name.
- **Layout:** the box keeps the 70/30 line.
- **After a pick by touch:** the box may show the white focus outline, because focus is put back on the menu after the page reloads. This needs checking on a real phone.

- **Someone with only one creator** sees "CREATOR" over its name, with no arrow. It can't be tapped, so the name is 13px, wraps, and the box grows taller for a long name rather than cutting it off. Screen readers hear "Creator" before it, and desktop shows the full name on hover.
- **Desktop and every other page** keep the top bar's picker exactly as before.
- **After choosing a creator,** the page reloads for that creator, as before, and keyboard focus returns to the picker, so a keyboard user can keep stepping through creators.
- **First load:** while the workspace loads, the top bar briefly shows its usual second row, then drops it once Chatters appears.

**No longer shown on phones:** the "Team Management" label, the "Chatters" heading (the top bar shows it, and screen readers still hear the heading), the intro, the "Chatter Records" title and sentence, the table and its sideways scrollbar, and the repeated "View QA incident history".

**Add Chatter is removed, on every screen size.**

- Chatters already come from People: giving someone the Chatter or Trial Chatter role creates their chatter record and keeps its name and Active/Inactive status in step.
- Add Chatter made a record with only a name and no person behind it. That record:
  - couldn't receive a strike, because Issue Strike needs a linked person
  - wasn't in any creator's roster, so Managers and QC, who see only their creators, never saw it
  - could only be joined to a real person through an Owner-only maintenance endpoint that no screen uses
- If the same person was later added in People, a second, linked record was created rather than matched, and incidents logged against the first never showed in their history.
- The server no longer creates name-only chatters either.
  - To someone allowed to manage QA profiles, it answers "Chatters are added in People. Give the person the Chatter or Trial Chatter role." (HTTP 405). Anyone else still gets the existing permission error (403).
  - Each attempt is still recorded in the Audit Log as a failed "chatter created" event, as before.
- An empty list now explains itself:
  - With all creators: "Chatters appear here once someone in People has the Chatter or Trial Chatter role."
  - With one creator chosen: "No chatters are assigned to this creator yet."
  - With a status filter on: "Try another status filter."
- The All / Active / Inactive tabs now tell screen readers which one is chosen, on phones and desktop.
- Name-only chatters that already exist stay as they are, with their history.

**Unchanged:**

- **Desktop**, apart from Add Chatter, the empty-list sentences, the tabs telling screen readers which is chosen, and a hover tooltip on a fixed creator's name. The creator picker stays in the top bar.
- Every other page: the creator picker stays in the top bar on Incidents, Rules and the Dashboard.
- QA profiles, renaming and deactivating chatters, and who can see what.

**How it's built:**

- The top bar's creator picker is defined once. A page can offer a place for it (`lib/model-picker-slot.ts`); Chatters does so only on phones, and the top bar then draws the picker there and drops its second row. Switching creators works as before: the page reloads for the new creator and offers its place again, and the picker is drawn there with focus.
- The phone rows are `components/ChatterPhoneList.tsx`, each a link to the same profile address the table opens.
- Backend: the old create handler in `routes/chatters.ts` is removed, and `routes/qa-chatters.ts` answers POST `/api/chatters` with 405.

## Verification (local)

- All 34 frontend suites, lint, the frontend build, and type checks with TypeScript 6.0.3 (as Railway builds) and 5.9.3.
- **`test:chatters-phone`** (new) renders, with fictional data:
  - **Rows:** name and when added, the Inactive tag only when it applies, the arrow, and links to the QA profile.
  - **The page as a phone and as a desktop** (a server render, so it shows the loading state): search and the picker's place on one line, the tabs, what phones don't show; desktop keeps its header and card; no Add Chatter anywhere.
  - **The code:**
    - one creator picker, drawn in the page only on phones, with the top bar a row shorter
    - focus returning to the picker after a switch
    - the fixed creator's tooltip
    - the empty-list sentences
    - the same page of chatters as the table
    - Add Chatter gone from the page and the API
  - A server render can't move the picker or switch creators, so those were checked in the browser below; the project has no browser test library.
  - **Styles:** search 70% and the picker 30%, search filling the line without a picker, 44px targets, 16px fields, 11px only for uppercase labels and 13px otherwise, monochrome, and nothing outside the phone block except the screen-reader class.
- **`test:header-redesign`** now finds the picker in its shared constant and checks the top bar still draws it.
- Backend, against the isolated loopback database:
  - `test-step1-qa-route-scope` gained a check that POST `/api/chatters` returns 405 for an Owner and a Manager and creates nothing.
  - It passes, along with `test-legacy-chatter-link` and `test-current-chatter-identity`.
  - Both TypeScript versions pass.
- **Checked signed in, on a local copy** with a fictional Owner account, four People-linked chatters and six fictional name-only ones.
  - At 440px (first pass, before the creator box):
    - The top bar is one row, and search and picker share a line: 284px and 114px, 70% of the line.
    - "All creators" fitted at 16px; on narrower phones it was cut, which the second pass fixes.
    - The first chatter starts at 215px.
  - Choosing a creator from the picker narrowed the list to that creator's chatters, saved the choice, and kept the picker beside the search.
  - With the keyboard, ArrowDown on the picker stepped through creators twice, keeping focus on the picker each time. A creator with no chatters showed "No chatters are assigned to this creator yet."
  - As a fictional QC person with one creator:
    - The name showed in the 30% box.
    - A long name ("Lena Park-Fictional Longname") wrapped onto three lines, and the box grew to 57px instead of cutting it off. This was in the first pass; with the "CREATOR" label above the name, such a box is taller still.
    - Desktop showed the name in the top bar, with a hover tooltip.
  - Incidents still shows the picker in the top bar's second row.
  - At 320px nothing runs past the right edge (search 200px, picker 78px).
  - At 1440px the picker is in the top bar, the table is unchanged, and there is no Add Chatter button.
- **Creator box (second pass), checked on the same local copy:**
  - **At 375px** (the width in Rainheart's Staging screenshot):
    - The box is 94 × 44px and reads "CREATOR" over "All". Search keeps 70% of the line.
    - Choosing "Nora Vale" showed "Nora Vale" in full. The list followed, and focus stayed on the menu.
    - A long name ("Nora Va…") ended in an ellipsis, and the box stayed 44px.
    - Tab from search reached the menu, and the box showed a 2px white outline.
  - **At 320px:** "CREATOR" fits on one line and nothing runs past the right edge. The box measured 75px wide in the desktop browser's phone view, which keeps a 10px scrollbar; on a real 320px phone it's about 78px.
  - **Review fixes:**
    - The menu covers the full 94 × 44px box, so a tap on the border also opens it.
    - The arrow sits beside the choice line.
    - Choosing a fictional inactive creator showed "INACTIVE" over "Iris More…". Desktop still showed "Creator" beside "Iris Moreau (Inactive)".
  - **As the fictional QC person:** the box reads "CREATOR" over "Lena Park", with no arrow, and screen readers still get the label.
  - **At 1440px:** the top bar's picker markup is unchanged: the same class, no extra element, and no extra attribute on the label.
  - The menu's 16px size and its invisible overlay are checked in the styles test. Whether an iPhone zooms can only be confirmed on a real iPhone.

  Staging itself was not checked signed in.

## Staging acceptance

1. On a phone, open Chatters. The top bar is one row. Search and the creator picker share a line, then the status tabs, then the chatters as rows. No sideways scrolling.
2. The creator box beside the search reads "CREATOR" over "All", nothing cut mid-word. Tap it: the full list opens, and the screen doesn't zoom in. Pick a creator: the box shows its name and the list narrows to that creator's chatters.
3. Tap a chatter: their QA profile opens.
4. There is no Add Chatter button, on a phone or a desktop.
5. Signed in as a Manager or QC with one creator, on a phone: the creator's name shows in full beside the search.
6. Give a test person the Chatter role in People: they appear in Chatters.
7. On a desktop, the page looks as before, minus Add Chatter.
