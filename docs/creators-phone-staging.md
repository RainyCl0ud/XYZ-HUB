# Creator Management on phones

Staging candidate, 25 November 2026. Production is outside this release.

At 375px, Creator Management was hard to use:

- The creator table was 948px wide inside a 329px box, so it scrolled sideways. Only Creator and Status fit. People, Incidents, Updated, Rename and Deactivate were off the right edge.
- The header and the four number cards took 423px, so the list started at 691px, at the bottom of the screen.
- Text was 9–12.5px, and buttons were 27–42px tall.

Rainheart approved the drawn proposal. The first drawing had Rename and Deactivate as cards with descriptions; Rainheart asked for something smaller, so they are now one row of two plain buttons.

## What changes (phones, 720px and below)

**The list**

- The big heading, description and number cards go; the top bar already says "Creators".
- **Search** fills the first row, with an **Add** button beside it. Add opens the same Add creator window as desktop, and it shows only for people who can add creators.
- **Tabs with counts:** All, Active and Inactive. The counts follow the search, as in Strike Management.
- **One row per creator:**
  - the name
  - "3 people · 5 incidents"
  - the account line: "Account: …" with "pending setup", "login deactivated" or "Creator role removed" when they apply, or "No creator account connected"
  - an Active or Inactive tag; inactive creators are dimmed
  - tapping a row opens that creator
- **One short note** replaces the policy box: the total user assignments, and that creators are never deleted and deactivating keeps assignments and history.

**A creator's screen**

- **Top:** a back arrow, "Creator" and the status tag; then the name and the account line.
- **Tiles:** People and Incidents, then Created and Updated, each date with its time.
- **One row of two buttons:** **Rename**, and **Deactivate** (thick outline) or **Reactivate**. They have no descriptions.
  - Each shows with the same permission as on desktop. If you can use only one, it fills the row. If you can use neither, there is no row.
  - They open desktop's Rename window and its Deactivate or Reactivate confirmation. The confirmation still says how many current assignments are kept.
- **After a rename or status change**, the screen updates in place.
- **Leaving the screen:** Back or Escape returns to the list, with focus on the creator's row.

**Windows (Add creator, Rename, the confirmation)**

- They sit over the creator screen and stop above the footer, scrolling inside.
- Fields are 16px and buttons and the close button are 44px.
- Text is 13px, with 11px uppercase labels.
- On phones each is a dialog named by its heading. Focus moves into it, and when it closes, focus returns to the button that opened it.
- The kept-assignments note in the confirmation is monochrome on phones.

**Unchanged**

- **Desktop:** checked locally at 1440px against `origin/staging`. The page and the Add, Rename and Deactivate windows gave identical HTML.
- Who can add, rename, deactivate or reactivate, and every confirmation.
- No backend change, migration, flag or setting.

## Review fixes

An independent review found no blocking problems. It confirmed that permissions and confirmations match desktop and that desktop is unchanged. These items from it are fixed:

- **Add window:** while it is open, the list behind it can't be reached, as already happened behind the creator screen.
- **Dialog role:** it sits on each window's overlay instead of on a `<form>`, which accessibility checkers reject.
- **Rotating past 720px:** focus no longer jumps to a stale target when a window was open as the phone rotated.
- **Closed creators stay closed:** if a reload no longer lists the open creator, its screen closes for good instead of possibly reopening later.
- **Focus fallback:** if the creator's row has left the current tab (say, after deactivating it on Active), Back puts focus on Add or the chosen tab, never on nothing.
- **Error messages:** the creator screen and windows now sit at z-index 300 and 310, above the header (90) and the menu (120) but below error and success messages (500). On older iPhones without the Popover API, those messages now stay visible.

These were checked again on the local copy:

- Add made the list unreachable while open.
- Each window was a dialog on its overlay.
- The screen still covered the top bar.
- After deactivating "Iris Moreau" from the Active tab, Back put focus on Add. "Iris Moreau" was then reactivated.

The Android system Back button steps through browser history rather than closing the creator screen, as in Strike Management.

## How it's built

- `components/CreatorPhoneViews.tsx` holds the rows and the creator screen. It has no hooks, so the test renders it directly.
- `ModelsPage` renders a phone branch next to the untouched desktop markup.
  - The windows are shared. On phones they get `role="dialog"`, `aria-modal` and a heading id.
  - The open window is tracked with each window's own render condition.
  - Crossing 720px closes the creator screen.
- The phone styles are one `@media (max-width: 720px)` block at the end of `ModelsPage.css`, scoped to `.models-page-phone`. They use only the design reference's greys.

## Verification (local)

- **Automated:**
  - all 38 frontend suites, lint and the build
  - type checks with TypeScript 6.0.3 (as Railway builds) and 5.9.3
  - `test:creators-phone` (new), with fictional data:
    - **rows:** text, plurals, every account-line case, opening the creator
    - **the creator screen:** bar, tiles, dates in Central time; the button row for every permission combination; inert while covered
    - **the page on phone and desktop:** permissions; window conditions; focus, Escape and the 720px reset
    - **styles:** sizes, palette, footer clearance
- **Checked signed in, on a local copy** with a fictional Owner account and fictional creators:
  - **At 375 × 812:**
    - The list started at 216px (was 691px), with nothing wider than the screen, no text under 13px and no button under 44px.
    - Opening a creator focused Back, and the list behind it was inert.
    - Rename opened over the screen with focus in its 16px field. Cancel returned focus to Rename.
    - Deactivate opened its confirmation with focus on Cancel. For a creator with people, the kept-assignments note was monochrome. Cancel returned focus to Deactivate.
    - Escape and Back each closed the screen with focus on that creator's row.
    - Add opened its window with focus in the field and stopped above the footer. Cancel returned focus to Add.
    - Round trip on the fictional "Iris Moreau":
      1. Deactivate changed the tag to Inactive and the button to Reactivate, and dimmed the name, with focus kept on that button.
      2. Reactivate restored Active.
  - **At 320 × 640:** the list and the creator screen fit, and the two buttons were about 140px each.
  - **Crossing to 1440px** closed the creator screen and showed desktop. Going back to phone width didn't reopen it.
  - **At 1440px:** desktop matched Staging's HTML, as above.

Staging itself was not checked signed in.

## Staging acceptance

1. On a phone, open Creators. You see search with Add, three tabs with counts, and one row per creator. Nothing scrolls sideways.
2. Tap a creator. Its screen shows the tiles and one row with Rename and Deactivate (or Reactivate).
3. Open Rename and cancel. Open Deactivate and cancel; it asks the same as on desktop. Don't confirm on a real creator.
4. Back returns to the list.
5. On a desktop, Creator Management looks as before.
