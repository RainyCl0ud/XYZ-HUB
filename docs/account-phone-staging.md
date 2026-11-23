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
- **Notification:** one full-width row, with the label on the left and the switch on the right.
  - The switch looks the same but has a 44px tap area.
  - When the browser blocks notifications, the explanation sits under it at 13px.
- **Profile:**
  - The picture sits beside the name and email. The camera badge still opens the picture editor.
  - Below them, the role tags wrap onto as many lines as needed, so several roles or long role names stay inside the card.
  - Long names and emails wrap rather than being cut off.
  - The "PROFILE" label is hidden.
- **Account status and Last sign-in:** one row each, with the label on the left and the value on the right. On the narrowest phones (320px) the date drops below its label.
- **Email:** appears once, under the name. The separate Email row is hidden on phones only.
- **Two-step sign-in:** buttons sit below the title, full width and 44px tall, in every state:
  - Set up authenticator app
  - Continue and Cancel
  - Get new recovery codes and Turn off
  - Done

  Two buttons share a row when each can be at least 150px wide; otherwise they stack. The "I've saved my recovery codes" row is 44px tall.
- **Picture editor:** the close button is 44px.

**Every width**

- **13px text:** the email, the status, the facts, the notification explanation, and the two-step title line, note and error. A global `!important` rule shrinks paragraphs inside cards (12.5px on desktop, 11.5px on phones); these now override it.
- **11px uppercase:** the PROFILE, EMAIL and LAST SIGN-IN labels (now letter-spaced like other Hub labels) and the role tags.
- **Role tags:** now uppercase with a grey border.
- **Status box:** the border is grey (#666666) instead of tinted green, as the monochrome rule requires.
- Otherwise the desktop layout is unchanged.

**Not changed here:**

- The small "PERSONAL ACCOUNT" label (also used in the picture editor) is 10px on desktop because of a site-wide rule.
- The intro sentence is 12.5px on desktop, for the same reason.
- Two-step form labels ("Enter your password to start") use the Hub's shared 11px field-label style.

These belong to a site-wide clean-up.

**Unchanged:** the Notification label and switch, the profile picture editor, two-step sign-in and its steps, Reset 2FA (an Owner action on People), and who sees what. Frontend only: no backend change, migration, flag or setting.

## Verification (local)

- All 32 frontend suites, lint, the frontend build, and type checks with TypeScript 6.0.3 (as Railway builds) and 5.9.3.
- **New `test:account-phone`** checks:
  - the 13px and 11px sizes, including the override of the global card-paragraph rule
  - the monochrome status border
  - the aligned title, the Notification row and its 44px switch target
  - the profile layout: picture, name and email, wrapping role tags, then the status and Last sign-in rows
  - the email shown once
  - the full-width 44px two-step buttons in each state
- **Checked signed in, on a local copy.** The local frontend and API ran against an isolated loopback database with a fictional Owner, using a long display name.
  - At 440px (the iPhone 16 Pro Max width in the report) the title now starts at the cards' edge, 17px from the screen edge instead of 66px, and the page fits on one screen.
  - Checked at 320px, 375px, 440px and 1440px with no horizontal scroll.
  - With three roles on the account (Owner, Ops Manager, Accountant), the tags wrap inside the card at 320px.
  - The switch sits at the right edge of its row with a 44px tap area.
  - Opening the two-step password step shows Continue and Cancel side by side at 44px. Nothing was submitted.
  - The local browser blocks notifications, so the "blocked" explanation was checked. The switch itself wasn't turned on.

  Staging itself was not checked signed in.

## Staging acceptance

1. On a phone, open My Account. "My Account" lines up with the cards below it.
2. Notification is one row with the switch on the right. It turns notifications on and off as before.
3. The profile shows your picture beside your name and email, then your role tags, then "Account status: Active" and Last sign-in as two rows. The email appears once.
4. "Set up authenticator app", or the buttons shown once it's on, spans the card.
5. Tap the picture: the editor opens as before.
6. On a desktop, the page looks as before, with larger text.
