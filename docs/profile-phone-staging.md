# Employee profile and a strike's person on phones

Staging candidate, 24 November 2026. Production is outside this release.

The profile's phone layout below was redesigned on 25 November 2026; see `profile-phone-redesign-staging.md`. The strike screen's list of the person's other strikes is unchanged.

On a 375px phone the employee profile was partly unusable:

- On the QA and Strikes tabs the profile was 796px wide inside a 375px screen, and the page cut it off. The history tables' Status and View columns and the Previous and Next buttons were off the right edge and couldn't be reached.
- The back button was a 215px box, and much of the text was 9–12.5px.
- On the Strikes tab, four number cards took 319px, so the history started at 782px, below the footer. Account Access was about 974px tall.

On a strike's screen in Strike Management, the only way to see the person's other strikes was a single "All strikes for …" row that left the page for that profile.

Rainheart approved the first proposal for both, and this release builds it.

## What changes

**A strike's screen (Strike Management, phones):**

- Under the strike's details, a label names the person and counts their other strikes, for example "CHRIS WILSON · 2 OTHER STRIKES", or "No other strikes".
- Their other strikes follow as rows: reason, date and status. Tapping one opens it in place of this one, scrolled to the top with focus on Back. Back still returns to the list, with focus on the strike you first opened.
- These come from the strikes the page has already loaded (the same account, or the same email once the account is gone), so there's no new request and no backend change.
- **Employee profile** is the last row, shown under the same conditions as the old "All strikes for …" row (the person still has an account and you can view People). It opens the profile on its Strikes tab, and the profile's back link returns to this strike.

**The employee profile on phones (720px and below):**

- **Back:** a small "‹ Strike Management" (or Incidents, or Employee Management) in place of the boxed button.
- **Header:** the initials, the name, and one grey line with the roles and email. The "EMPLOYEE PROFILE" label and the card box go.
- **⋯ beside the name** holds Edit assignments and Change team (Add to a team when there's none), each only with the permissions the desktop buttons need. Edit assignments shows only once the person has a team, because the editor needs one. Without these permissions there is no ⋯.
- **Tabs:** Overview, QA, Strikes, Access, sharing the width. Nothing runs past the screen.
- **Overview:** one list with Team, Role (with its data scope) and Models.
- **QA:** Incidents and QA profile, then "HISTORY · N" and one row per incident (rule, date · severity · weight, status). Tapping a row opens the incident.
- **Strikes:** Standing, Active strikes, Deduction, Next expiry and Ladder as one list, then "HISTORY · N" and one row per strike (reason, date · standing, status). Tapping a row opens that strike's screen in Strike Management.
- **Access:**
  - Status, Created, Email verified and Last sign-in as one list.
  - Resend invitation (pending accounts), **Reset 2FA** and Reactivate account (deactivated accounts) as rows, each shown under the same conditions as on desktop.
  - Deactivate account and Permanently delete account as quiet grey links at the bottom, never on your own profile, as on desktop.
  - Each still opens the same confirmation as on desktop; Delete still asks for the account's email.
- **Statuses:** Active and Open tags are white, Expired and Resolved grey, and Voided dim (with the row dimmed).
- **Dates** in rows read "Nov 23". A date from another year keeps its year ("Nov 23, 2025"), so history across years stays clear. Strike Management's phone rows follow the same rule.
- **Team colours** aren't shown on phones, so the profile stays monochrome.
- **Page buttons** show only when a history has more than one page.
- **Windows** (Edit assignments, Change team, and the confirmations):
  - They stop above the fixed footer, and their content scrolls inside, so Cancel and the main button stay visible.
  - Fields are 16px, so iPhones don't zoom in.
  - Text is 13px, with small labels 11px uppercase.
  - Buttons and the close button are 44px.
- **Keyboard and screen readers:**
  - On phones, each window is a dialog named by its heading.
  - Focus moves into it when it opens: to the first control, or to the email field for Delete.
  - The profile behind it can't be reached.
  - When it closes, focus returns to ⋯ or to the row that opened it (or to the chosen tab when that row is gone, for example after deactivating).
  - Change team waits while a save is running, like desktop's button.

**No longer shown on phones:** the "EMPLOYEE PROFILE" label, the role badges (now in the grey line), the section headings and descriptions, the number cards, the tables, and the boxed Edit, Change Team, Reset 2FA, Deactivate and Delete buttons (now in ⋯, as rows, or as quiet links).

**Unchanged:**

- **Desktop.** Checked locally at 1440px against `origin/staging`, after the review fixes: all four tabs, Edit assignments, the team window, and the Reset 2FA and Delete confirmations gave identical HTML.
- Who can see or change what, and every confirmation.
- What the API returns. Frontend only: no backend change, migration, flag or setting.

**How it's built:**

- `components/ProfilePhoneViews.tsx` holds the facts list, the history rows and the pager.
- `PeopleQaPanel` takes `layout="phone"` for the QA and Strikes tabs.
- The page's phone styles are one block at the end of `PeoplePage.css`, all inside `@media (max-width: 720px)` and scoped to the profile.
- `lib/time.ts` gains `formatCentralShortDate`, now shared with the strike rows.

## Verification (local)

- All 37 frontend suites, lint, the frontend build, and type checks with TypeScript 6.0.3 (as Railway builds) and 5.9.3.
- **`test:profile-phone`** (new), with fictional data.
  - **Rendered:**
    - The facts list.
    - History rows: text order, the status tones, a dimmed voided row, an empty history, and each row opening its record.
    - The pager: hidden for one page.
    - The page's back link on a phone (naming Strike Management, Incidents or Employee Management) and the boxed button on desktop. This is a server render, so the profile itself shows as loading.
  - **Read from the code:**
    - Each tab's phone list.
    - ⋯ items and their permissions.
    - The Access rows and links with desktop's conditions, including your own profile.
    - The same confirmations.
    - Focus returning after a window closes.
    - The menu closing when crossing 720px.
    - The QA and Strikes branches, and the shared short date.
    - On phones, windows as dialogs, focus moved into them, inert behind, and Change team waiting for a save.
  - **Rendered (dates):** this year's dates are short, other years keep the year, dates are read in Central time, and a bad date shows a dash.
  - **Styles:**
    - Nothing outside the 720px block.
    - 11px only for uppercase labels, 13px otherwise. Monochrome.
    - 44px targets and 16px fields.
    - Tabs share the width; long values wrap.
    - Windows stop above the footer.
- **`test:strikes-phone`** now covers the person's other strikes: the label and count, a row, opening it in place, the matching rule, and the profile row's conditions.
- **Checked signed in, on a local copy** with a fictional Owner account and fictional people, strikes and incidents. One fictional team was added locally so Edit assignments could open.
  - **Strike screen at 375 × 667:**
    - "QUINN HARPER · 1 OTHER STRIKE" with its row.
    - Tapping it opened that strike, scrolled to the top, with focus on Back.
    - Back returned focus to the first strike's row.
  - **Profile at 375px:**
    - It is 331px wide, and nothing runs past the screen on any tab.
    - The four tabs are 83px each.
    - No text under 13px except the uppercase labels, and no tap target under 44px.
    - The Strikes history starts at 522px, down from 782px. Account Access is 384px tall, down from 974px.
  - **Windows:**
    - Reset 2FA's confirmation opened and was cancelled, and focus returned to its row.
    - Delete's confirmation had a 16px field with its button waiting for the email. It was cancelled, nothing was deleted, and focus returned to its link.
    - Add to a team and Edit assignments opened from ⋯ with 16px fields and 44px buttons. Edit assignments scrolled inside and ended above the footer. Each was cancelled, and focus returned to ⋯.
  - **Round trip:**
    - Strike screen → Employee profile opened the Strikes tab with "‹ Strike Management".
    - A history row opened that strike's screen.
    - The profile's back link returned to the first strike's screen.
  - **At 320px:** nothing runs past the screen on any tab.
  - **After the review fixes, at 375px:**
    - Reset 2FA, Change team and Delete each opened as a dialog named by its heading ("Reset 2FA for …", "Change Team", "Permanently delete …").
    - Focus landed on Cancel, the close button, and the email field respectively.
    - The back link and profile behind were inert.
    - On Cancel, focus returned to the row or ⋯, and the profile was reachable again.
    - With the team-colour class on the profile, it showed no coloured border or line.
  - **At 1440px:** desktop matched Staging's HTML, as above.

  Staging itself was not checked signed in.

## Staging acceptance

1. On a phone, open a strike in Strike Management. Under its details, the person's other strikes are listed with their count; tapping one opens it. Employee profile opens their profile on Strikes.
2. On the profile: a small back link, the name with one grey line, ⋯ (if you can edit), and four tabs. No sideways scrolling on any tab.
3. Strikes and QA: the facts, then one row per record. Each row opens the strike or incident.
4. Access: the account facts, Reset 2FA as a row, and Deactivate and Delete as quiet links (not on your own profile). Open one and cancel; it asks the same as on desktop. (Don't confirm on a real account.)
5. ⋯: Edit assignments and Change team open their windows; Cancel and Save stay visible.
6. On a desktop, the profile and Strike Management look as before.
