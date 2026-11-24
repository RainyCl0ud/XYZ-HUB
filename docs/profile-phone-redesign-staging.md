# Employee profile on phones: redesign

Staging candidate, 25 November 2026. Production is outside this release.

This replaces the phone layout from `profile-phone-staging.md` (PR #163) after Rainheart's review on Staging:

- The back link scrolled away with the page.
- Strike and QA history had become a plain list. It's table data, and the list felt crowded with no spacing. The other tabs had the same problem.
- Deactivate and Permanently delete were small grey links that read as unimportant, unlike the boxed Danger Zone on desktop.
- Overview needed a better layout.

Rainheart approved the drawn redesign, with three changes: no label or line on the pinned back link, Deactivate and Delete inside a window opened from the Danger zone, and the rest as drawn.

## What changes (phones, 720px and below)

- **Back link:** it stays just under the top bar while the profile scrolls beneath it. There's no line under it.
- **Header:**
  - the initials, the name, and the role as a small boxed tag
  - the email on its own full-width line, so it no longer breaks mid-word
  - the ⋯ menu is gone; its two edits now sit on Overview
- **Overview:**
  - "Assignments" with a short note and an **Edit** button. As before, Edit shows only once the person has a team, because the editor needs one.
  - **Team** card, with **Change team** (or Add to a team) beside the team name.
  - **Role** card: each role with its data scope in words.
  - **Models** card: the count, then the models as boxed chips.
  - Edit and Change team need the same permissions as desktop. Without them, the cards show without buttons, and the scope note explains why.
- **QA and Strikes:**
  - The numbers are boxed tiles, two across, like desktop's cards:
    - **Strikes:** Current standing (with the ladder version), Active strikes, Current deduction, and Next expiry (with its time)
    - **QA:** Total incidents and QA profile
  - The history is a table titled "Strike history" or "QA history", with its record count:
    - columns: Reason or QA record, Issued or Date, and Status
    - the standing and deduction, or the severity and weight, on a grey line under each title
    - tap a row to open that strike or incident, in place of desktop's View button
  - Page buttons still show only with more than one page.
- **Access:**
  - Status, Last sign-in, Created and Email verified as tiles. Each date has its time under it.
  - "Security and sign-in" holds one card per action, each with desktop's description and a full-width button:
    - Invitation pending: Resend invitation
    - **Reset two-factor authentication: Reset 2FA**
    - Reactivate account
  - A boxed **Danger zone** at the bottom, with desktop's heavy top line, says what it holds: "Deactivate or permanently delete this account" (or just the one that applies).
- **The Danger zone window:**
  - Tapping the Danger zone opens a window with Deactivate account and Permanently delete account, each with desktop's description and a thick-outlined button.
  - Choosing one closes the window and opens the same confirmation as desktop. Delete still asks for the account's email.
  - Cancel or × closes the window without doing anything.
  - Each action shows under desktop's conditions. The box never shows on your own profile, or when neither action can be used.
- **Keyboard and screen readers:**
  - The Danger zone window is a dialog named "Danger zone". Focus moves into it when it opens, and the profile behind it can't be reached.
  - When it, or the confirmation opened from it, closes, focus returns to the Danger zone box.
  - Edit, Change team and the security buttons return focus to themselves, as before.

**Unchanged:**

- **Desktop.** Checked locally at 1440px against `origin/staging`: all four tabs, plus the Edit, team, Reset 2FA, Deactivate and Delete windows, gave identical HTML.
- Who can see or change what, and every confirmation.
- What the API returns. This is frontend only: no backend change, migration, flag or setting.

## How it's built

- `components/ProfilePhoneViews.tsx`: `ProfilePhoneTiles`, `ProfilePhoneSectionHead`, `ProfilePhoneTable` and `ProfilePhonePager`. They replace the earlier facts list and history rows.
- `PeopleQaPanel`'s phone branches use the tiles and the table.
- `lib/time.ts` gains `formatCentralDateParts` (a date and its time, on two lines).
- `PeopleDetailPage`:
  - The ⋯ menu is replaced by Overview's buttons.
  - The Danger zone window is new.
  - The open window is now tracked by name. That way, swapping the Danger zone window for a confirmation still moves focus into the confirmation.
- The phone styles replace the earlier block at the end of `PeoplePage.css`, all inside `@media (max-width: 720px)`.

## Verification (local)

- **Automated:**
  - all 37 frontend suites, lint and the build
  - type checks with TypeScript 6.0.3 (as Railway builds) and 5.9.3
  - `test:profile-phone`, rewritten for this layout, with fictional data
- **Checked signed in, on a local copy** with a fictional Owner account and fictional people, strikes and incidents:
  - **At 375 × 812:**
    - The back link stayed just under the top bar after scrolling.
    - Every tab had tiles, cards or a table as drawn.
    - Nothing was wider than the screen, no text was under 13px except uppercase labels, and no button was under 44px.
  - **Overview:**
    - Edit opened Edit assignments, and Change team opened the team window.
    - Each was cancelled, and focus returned to its button.
  - **Danger zone:**
    - It opened as a dialog named "Danger zone", with focus on its close button and the profile behind it inert.
    - Deactivate account opened "Deactivate …?", with focus inside it. Cancel returned focus to the Danger zone box.
    - Permanently delete opened "Permanently delete …?". Focus was in its 16px email field, and the button waited for the email. Cancel and × returned focus to the box.
    - Nothing was deactivated or deleted.
  - **Visibility:**
    - Your own profile showed no Danger zone.
    - A deactivated account showed Reactivate, and a Danger zone holding only Delete.
    - A pending account showed Invitation pending.
  - **At 320px:** nothing was wider than the screen, and the table's header and rows stayed aligned.
  - **At 1440px:** desktop matched Staging's HTML, as above.

Staging itself was not checked signed in.

## Staging acceptance

1. On a phone, open an employee profile and scroll. The back link stays at the top with no line under it.
2. **Overview:** Team, Role and Models cards. Edit (when there's a team) and Change team open their windows.
3. **Strikes and QA:** tiles, then a history table. Tap a row and it opens that strike or incident.
4. **Access:** tiles, Reset 2FA in its own card, then the Danger zone box at the bottom (not on your own profile).
5. **Danger zone:** tap it to see Deactivate and Permanently delete. Choose one to see its usual confirmation, then cancel. Don't confirm on a real account.
6. On a desktop, the profile looks as before.
