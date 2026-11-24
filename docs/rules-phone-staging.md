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

   A tap elsewhere, Escape, or choosing an action closes it. People who can only view rules see just Archived rules.
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
  - Focus moves to Back when it opens, and comes back to Back when a window over it closes.
  - When the screen closes, focus returns to the rule's row, or to search if the rule was archived.

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
- **`test:rules-phone`** (new) renders, with fictional data:
  - **Rows:**
    - the name and grey line
    - missing values are skipped
    - screen readers hear the words apart
    - each row opens its rule
  - **The ⋯ menu:** closed and open states, the actions in order, and how it closes.
  - **The rule screen:**
    - dialog name and order
    - Edit and Archive only for people who manage rules
    - "None" for missing values, and history loading
  - **The page as a phone and as a desktop** (a server render, so it shows the loading state).
  - **The page's code:**
    - menu permissions
    - Edit and Archive reuse the existing form and confirmation
    - the screen follows the latest version and closes on archive
    - focus handling
    - the corrected intro
    - the creator picker leaving Rules
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
    - Archiving asked to confirm, closed the screen, removed the rule from the list and moved focus to search. Reactivating it from Archived rules brought it back.
  - **Archived rules** filled the screen, with 44px History and Reactivate buttons.
  - **At 320px:** nothing runs past the right edge, the menu fits, and Back returned focus to the rule's row.
  - **At 1440px:** desktop matched Staging's HTML, as above, and has no creator picker on Rules.
  - **View-only:** QC can't open Rules by default, so the view-only screen (no Edit or Archive) was checked in the automated test only.

  Staging itself was not checked signed in.

## Staging acceptance

1. On a phone, open Rules. The top bar is one row. Search and a small ⋯ button share a line, then the rules as rows. No sideways scrolling.
2. Tap ⋯: Add rule, Rule settings and Archived rules. Each opens what it says.
3. Tap a rule: its screen shows the wording, Severity, Weight and Version. Edit is at the top right; Version history opens earlier versions.
4. Edit a rule and save: the screen shows the new version.
5. Archive this rule at the bottom asks to confirm, then the rule leaves the list. Reactivate it from Archived rules.
6. On a desktop, Rules looks as before, without the creator picker.
