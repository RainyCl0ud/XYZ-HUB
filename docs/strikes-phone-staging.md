# Strike Management on phones

Staging candidate, 24 November 2026. Production is outside this release.

On a 375px phone the first strike started at 953px of an 812px screen, so you had to scroll before seeing any. Above it sat:

- a label, a heading and an intro
- three stacked buttons (Issue Strike, Reasons and a gear)
- four number cards, 288px tall
- a search box with three dropdowns, 210px tall

The table was 1,030px wide with View about two and a half screens to the right. The details window was taller than the screen, with labels under 12px and a 34px close button, and the Issue Strike form's 12px fields made iPhones zoom in.

Rainheart approved the same quiet layout as Rules, and this release builds it.

## What changes

**Phones (720px and below)**

1. **Search with one small "⋯" button.**
   - The menu holds Issue strike, Strike reasons and Strike ladder. Each item shows only with the permission its desktop button needs.
   - Someone with none of these gets no ⋯, and search fills the line.
   - The search reads "Search strikes" and still looks through employee, reason, issuer and details.
   - A tap elsewhere, tabbing out, Escape (with focus in the menu), choosing an action or opening a strike closes it.
2. **Status tabs with counts** replace the four number cards and the Status dropdown, for example 5 All, 3 Active, 1 Expired, 1 Voided. Tap one to filter; screen readers hear which is chosen.
3. **One row per strike:**
   - the person's name
   - one grey line with the reason and date, for example "Missed shift handover · Nov 23"
   - the status on the right: Active white, Expired grey, Voided dim; voided rows are dimmed
4. **The Employee and Reason dropdowns aren't on phones**, because the search covers both. A choice made on a wider screen doesn't apply on a phone, and comes back on the wider screen.
5. **The page buttons** (Previous / Next) show only when there's more than one page.

**Tap a strike: its own screen.**

- A top bar with a back arrow, "Strike" and the status.
- The person's name and email.
- One plain list:
  - Reason
  - Standing
  - Deduction
  - Strike number at issue
  - Issued, and Issued by
  - Expires
  - Ladder version
- Details, the reason's description at issue, the evidence link, and, for a voided strike, when, by whom and why.
- **All strikes for [name]**: one row, shown when the person still has an account and you can view People. It replaces "View Employee Strikes".
- **Void this strike**: a quiet grey link at the bottom, shown under the same conditions as on desktop. It opens the same form, which asks for a reason; afterwards the strike shows as Voided and the counts update.
- **Keyboard and screen readers:**
  - The screen is a dialog named by the person.
  - The list behind it can't be reached with Tab or a screen reader.
  - Focus moves to Back when it opens. Escape closes it, unless a form is open over it.
  - When the screen closes, focus returns to the strike's row.
- The screen, and the Issue and Void forms, stop above the fixed footer, so nothing hides behind it.

**Issue Strike and Void Strike forms on phones:**

- 16px fields, so iPhones don't zoom in.
- 13px labels and text; the small "Disciplinary correction" and "Optional" labels are 11px uppercase.
- 44px buttons, and a 44px close button.

**No longer shown on phones:** the label, heading (screen readers still hear it) and intro; the three header buttons (now in ⋯); the four number cards (now the tab counts); the Employee, Reason and Status dropdowns; the table.

**Shared with Rules:** the ⋯ menu is now one component, `components/PhoneActionMenu.tsx`, used by Rules and Strikes. Rules looks and behaves as before.

**Unchanged:**

- **Desktop.** Checked locally at 1440px: the page, the details window and the Issue Strike form gave identical HTML before and after this change.
- Who can issue, void, see reasons, see the ladder and open People profiles.
- What a strike records. Standing and deduction move from the row to the strike's screen.

**How it's built:**

- Frontend only. No backend change, migration, flag or setting.
- One page serves both layouts. The selected strike shows as a screen on phones and as the window on desktop, so crossing 720px keeps it open.
- `components/StrikePhoneViews.tsx` holds the rows and the strike screen.
- `lib/strike-status.ts` holds the status names and tag classes, shared with the table.

## Verification (local)

- All 36 frontend suites, lint, the frontend build, and type checks with TypeScript 6.0.3 (as Railway builds) and 5.9.3.
- **`test:strikes-phone`** (new), with fictional data. It renders some pieces and reads the code for the rest.
  - **Rendered:**
    - Rows: name, reason · date and status; voided rows dimmed; each row opens its strike.
    - The strike screen: order; Void and all-strikes only when given; a voided strike's history; "No deduction".
    - The page as a phone and as a desktop. This is a server render, so the counts are 0 and rows don't show. The view-only phone has no ⋯.
  - **Read from the code:**
    - Menu permissions match desktop, and the tab counts are the desktop card numbers.
    - Void and all-strikes conditions match desktop.
    - Hidden filters don't apply on phones.
    - Focus, Escape and the inert list.
    - The menu closes when crossing 720px or opening a strike.
    - The single-page pager is hidden.
    - Status helpers come from one place.
  - **Styles:**
    - 11px only for uppercase labels, 13px otherwise.
    - Monochrome, 44px targets and 16px fields.
    - Screens stop above the footer.
    - Nothing outside the phone block except the screen-reader class.
- **`test:rules-phone`** now checks the shared ⋯ menu and its styles.
- **Checked signed in, on a local copy** with a fictional Owner account and five fictional strikes (active, expired and voided):
  - **At 375px:**
    - The first strike starts at 223px, down from 953px.
    - The tabs read 5 / 3 / 1 / 1, and tapping Voided showed only the voided strike.
    - The menu had its three actions at 44px, and a tap elsewhere closed it.
  - **Strike screen:**
    - Opening a voided strike focused Back and showed its void history, with no Void link. Back returned focus to its row.
    - An active strike's screen ended above the footer.
    - Void this strike opened the void form (16px field, 44px buttons). Confirming it marked the strike Voided, updated the counts, and returned focus to its row.
  - **Issue Strike** opened from ⋯ with 16px fields and 44px buttons, then was cancelled.
  - **At 320px:** nothing runs past the right edge; the tabs are 67px each and the menu and Issue Strike form fit.
  - **Rules** still opens its ⋯ menu ("More rule actions") with the same three actions.
  - **At 1440px:** desktop matched Staging's HTML, as above.

  Staging itself was not checked signed in.

## Staging acceptance

1. On a phone, open Strike Management. Search and a small ⋯ share a line, then tabs with counts, then the strikes as rows. No sideways scrolling.
2. Tap a tab: the list shows only that status.
3. Tap ⋯: Issue strike, Strike reasons and Strike ladder (as your role allows). Each opens what it says.
4. Tap a strike: its screen shows the reason, standing, deduction and dates. All strikes for the person opens their People profile.
5. Void this strike at the bottom asks for a reason; afterwards the strike shows Voided and the counts change. (Use a test strike.)
6. On a desktop, Strike Management looks as before.
