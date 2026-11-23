# My Account on phones

Staging candidate, 23 November 2026. Production is outside this release.

On a phone, My Account had several problems:

- The title block was centred and indented, out of line with the cards. A phone rule stacks the header and this page's own rule centred it.
- The Notification switch floated on its own line.
- The profile repeated the email.
- The role and status were squeezed under the picture.
- The two-step button was cramped beside its title.
- Most text was 10–11.5px.

## What changes

**Phones (720px and below)**

- **Title:** "My Account" lines up with the cards. The small "PERSONAL ACCOUNT" label and the intro sentence are hidden, since the top bar already names the page.
- **Notification:** one full-width row, with the label on the left and the switch on the right. When the browser blocks notifications, the explanation sits under it at 13px.
- **Profile:**
  - The picture sits beside the name and email; the camera badge still opens the picture editor.
  - The role tag and "Account status: Active" share one line below.
  - The "PROFILE" label is hidden.
  - The email appears once, under the name. The separate Email row is hidden on phones only.
- **Last sign-in:** one row, with the label on the left and the date on the right. On the narrowest phones (320px) the date drops below the label.
- **Two-step sign-in:** "Set up authenticator app" is full width and 44px tall, below the title. The other buttons in the card are full width too: Continue and Cancel, Get new recovery codes and Turn off.

**Every width**

- Text follows the web kit scale. The email, facts, status, notification explanation and two-step text are 13px. Labels and the role tag are 11px uppercase.
- The two-step text was capped by a global `!important` rule that shrinks paragraphs inside cards (11.5px on phones). It now overrides that rule.
- The status box border is grey (#666666) instead of a tinted green, as the monochrome rule requires.
- Otherwise the desktop layout is unchanged.

**Unchanged:** the Notification label and switch, the profile picture editor, two-step sign-in and its steps, Reset 2FA (an Owner action on People), and who sees what. Frontend only: no backend change, migration, flag or setting.

## Verification (local)

- All 32 frontend suites, lint, the frontend build, and type checks with TypeScript 6.0.3 (as Railway builds) and 5.9.3.
- **New `test:account-phone`** checks:
  - 13px text (11px only for uppercase labels)
  - the override of the global card-paragraph size
  - the monochrome status border
  - the aligned title and the Notification row
  - the compact profile grid, the email shown once, and the Last sign-in row
  - the full-width two-step buttons
- **Checked signed in, on a local copy.** The local frontend and API ran against an isolated loopback database with a fictional Owner, using a long display name to test wrapping.
  - At 440px (the iPhone 16 Pro Max width in the report) the title now starts at the cards' edge, 17px instead of 66px. The page fits on one screen.
  - Checked at 320px, 375px, 440px and 1440px with no horizontal scroll.
  - The switch sits at the right edge of its row.
  - Opening the two-step password step shows Continue and Cancel side by side at 44px. Nothing was submitted.
  - The local browser blocks notifications, so the "blocked" explanation was checked; the switch itself wasn't turned on.

  Staging itself was not checked signed in.

## Staging acceptance

1. On a phone, open My Account. "My Account" lines up with the cards below it.
2. Notification is one row with the switch on the right. It turns notifications on and off as before.
3. The profile shows your picture beside your name and email, then your role and "Account status: Active" on one line. The email appears once.
4. Last sign-in is a single row.
5. "Set up authenticator app", or the buttons shown once it's on, spans the card.
6. Tap the picture: the editor opens as before.
7. On a desktop, the page looks as before, with larger text.
