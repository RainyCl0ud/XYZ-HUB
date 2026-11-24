# Rules on phones

Staging candidate, 24 November 2026. Production is outside this release.

On a 375px phone the Rules page started its first rule at 677px of an 812px screen. Above it sat the creator picker, a label, a two-line heading, an intro, Add Rule, a full-width button with only a gear, a card title and sentence, search and Archived. The table was 1,000px wide, so History, Edit and Archive sat about two and a half screens to the right, as 26px-tall links, and most text was 10–12px.

Rainheart found a first sketch still crowded, with buttons too big or in the wrong place, and approved a quieter one, which this release builds.

## What changes

**Phones (720px and below)**

1. **Search with one small "⋯" button.** It's 44 × 44px and opens a short menu:
   - Add rule
   - Rule settings
   - Archived rules (with the count)

   A tap elsewhere, tabbing out of it, Escape (while focus is in the menu), choosing an action, or opening a rule closes it. People who can only view rules see just Archived rules.
2. **One row per rule:**
   - the rule's name
   - one grey line with the version, severity and weight, for example "v2 · Minor · Medium"
   - an arrow; the whole row opens the rule
3. **Previous, Page 1 of 2, Next**, as before, six rules per page.

**Tap a rule: its own screen.**

- A top bar with a back arrow, "Rule", and **Edit** as a word on the right.
- The name, the full wording, then Severity, Weight (with its value, e.g. "Medium (2)") and Version.
- **Version history**, one row that opens the earlier versions.
- **Archive this rule**: a quiet grey link at the bottom, away from Edit. It asks to confirm first, as before.
- Edit opens the existing "Create New Rule Version" form over the screen. After saving, the screen shows the new version. After archiving, the screen closes and the rule leaves the list.
- People who can only view rules get no Edit and no Archive.
- **Keyboard and screen readers:**
  - The screen is a dialog named by the rule.
  - While it's open, the list behind it can't be reached with Tab or a screen reader.
  - Focus moves to Back when it opens, and comes back to Back when a window over it closes.
  - Escape closes the screen, unless a window is open over it.
  - When the screen closes, focus returns to the rule's row. If the rule was archived, focus goes to ⋯, not the search, which would bring up the keyboard.
- **Widening past 720px** (rotating or resizing) closes the rule screen and the menu, so they don't reappear later.

**Windows on phones:**

- Archived rules and Version history fill the screen.
- Their History and Reactivate buttons are 44px.
- The Version and Archived tags are 11px uppercase.
- Add rule, the new-version form and the confirmation get:
  - 16px fields, so iPhones don't zoom in
  - 13px labels and text
  - 44px buttons, and a 44px close button

**No longer shown on phones:**

- The "Policy Management" label, the heading (screen readers still hear it) and the intro.
- The Add Rule button, the gear button and the Archived button; they're in the menu now.
- The "Rule Records" title and sentence.
- The table, including its Status column, which always said Active.

**On every screen size:**

- **The creator picker is gone from Rules and Rule Settings.**
  - Rules are the same for every creator: the rules list and its server code never read the creator choice, so picking a creator only reloaded the same list.
  - On phones the top bar is back to one row.
  - Incidents, Chatters and the Dashboard keep the picker.
- **The Add rule form's intro** said "Create a strike reason and its initial version." It now says "Create a rule and its first version."

**Unchanged:**

- Desktop. Checked locally at 1440px: the page and the version-history window gave identical HTML before and after this change, apart from one added class name. The Add rule form differs only by the corrected intro.
- Who can add, edit, archive and reactivate rules.
- Rule settings, and how versions are saved.

**How it's built:**

- Frontend only. No backend change, migration, flag or setting.
- One page serves both layouts.
- `components/RulePhoneViews.tsx` holds the rows, the ⋯ menu and the rule screen.
- The existing forms, confirmation, archived and history windows are reused and only restyled on phones.
- `AppLayout.tsx` drops Rules and Rule Settings from the pages that show the creator picker.

**Not changed here:** in the desktop browser's phone view at 320 × 700, the page can scroll 23px because the closed navigation drawer is taller than the screen. Incidents and Chatters do the same today; it's separate from this release.

## Verification (local)

- All 35 frontend suites, lint, the frontend build, and type checks with TypeScript 6.0.3 (as Railway builds) and 5.9.3.
- **`test:rules-phone`** (new), with fictional data. It renders some pieces and reads the code for the rest.
  - **Rendered:**
    - **Rows:** the name and grey line; missing values are skipped; screen readers hear the words apart; each row opens its rule.
    - **The ⋯ menu:** closed and open, with the actions in order.
    - **The rule screen:** dialog name and order; Edit and Archive only when given; "None" for missing values; history loading.
    - **The page as a phone and as a desktop:** a server render, so only the loading state, not the rows. Desktop is also rendered for a view-only account, where Add Rule and the gear stay hidden.
  - **Read from the code** (these can't run in a server render):
    - How the menu closes: an outside tap only while open; Escape only with focus inside; Tab out; choosing an action; opening a rule.
    - Menu permissions, and that Edit and Archive reuse the existing form and confirmation.
    - The screen follows the latest version and closes on archive.
    - Focus:
      - nothing is taken from a window open over the screen
      - Back gets focus, and focus later returns to the row or to ⋯
      - Escape closes the screen
      - the list behind is inert
      - widening past 720px closes the screen and menu
    - The corrected intro, and the creator picker leaving Rules.
  - A deliberate breakage (removing the guard that keeps focus in a window open over the screen) was confirmed to fail it.
  - **Styles:**
    - 11px only for uppercase labels, 13px otherwise
    - monochrome, 44px targets and 16px fields
    - full-screen rule, history and archived screens
    - nothing outside the phone block except the screen-reader class
- **Checked signed in, on a local copy** with a fictional Owner account and four fictional active rules plus one archived:
  - **At 375px:**
    - The top bar is one row with no creator picker.
    - Search and ⋯ share a line, and the first rule starts at 151px, down from 677px.
    - The menu opened with its three actions, each 44px at 13px. Escape closed it and returned focus to ⋯, and a tap elsewhere closed it.
  - **Rule screen:**
    - Opening it focused Back.
    - Version history opened over it; closing it, or cancelling Edit, returned focus to Back. The Edit form had 16px fields and 44px buttons.
    - Archiving asked to confirm, closed the screen and removed the rule from the list. Reactivating it from Archived rules brought it back. (Focus then went to search; after the review it goes to ⋯ instead.)
  - **After the review fixes:**
    - With a rule open, the rows behind it couldn't take focus, and Escape closed the screen and returned focus to the row.
    - Tabbing out of the menu, either way, closed it, as did opening a rule.
    - Widening to 1024px with a rule open, then back to 375px, didn't bring the screen back.
  - **Archived rules** filled the screen, with 44px History and Reactivate buttons.
  - **At 320px:** nothing runs past the right edge, the menu fits, and Back returned focus to the rule's row.
  - **At 1440px:** desktop matched Staging's HTML, as above, and has no creator picker on Rules.
  - **View-only:** QC can't open Rules by default, so the view-only rule screen (no Edit or Archive) was checked only by rendering the screen on its own in the test. The phone menu's view-only items were checked only by reading the code.

  Staging itself was not checked signed in.

## Staging acceptance

1. On a phone, open Rules. The top bar is one row. Search and a small ⋯ button share a line, then the rules as rows. No sideways scrolling.
2. Tap ⋯: Add rule, Rule settings and Archived rules. Each opens what it says.
3. Tap a rule: its screen shows the wording, Severity, Weight and Version. Edit is at the top right; Version history opens earlier versions.
4. Edit a rule and save: the screen shows the new version.
5. Archive this rule at the bottom asks to confirm, then the rule leaves the list. Reactivate it from Archived rules.
6. On a desktop, Rules looks as before, without the creator picker.
