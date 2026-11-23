# My Account on phones

Staging candidate, 24 November 2026. Production is outside this release.

The first phone version (23 November) fixed alignment and text sizes but still showed a lot. Rainheart found it crowded, with too much text. The page now has its own short phone layout, built from the sketch Rainheart approved.

## What changes

**Phones (720px and below)**

From top to bottom:

1. **Profile, centred:** a larger picture (84px) with the camera badge, then the name, email and role tags. Long names, emails and role names wrap.
2. **Settings card:** two 56px rows.
   - **Notification:** the switch on the right, with a 44px tap area. The explanation appears only when the browser blocks notifications.
   - **Two-step sign-in:** shows the current method, "Email codes" or "Authenticator app", with an arrow.
     - Tap it to open the explanation and its buttons. Tap again to close it. The arrow points down while it's open.
     - Once the authenticator is on, opening it shows when it was turned on, how many recovery codes are left, and the two buttons, Get new recovery codes and Turn off.
     - During setup (password, QR code, recovery codes), or after an error, the row stays open and can't be folded away mid-step.
3. **Last sign-in:** one grey line, for example "Last sign-in Nov 22, 2026, 9:51 AM CST".

**No longer shown on phones:**

- The "My Account" heading. The top bar already shows it, and screen readers still hear the heading.
- The "PERSONAL ACCOUNT" label and the intro sentence.
- The PROFILE label.
- "Account status: Active". Anyone who can open the page is active.
- The second email row.
- The long two-step explanation, until the row is opened.

**Other phone details:** buttons are full width and 44px tall; two share a row when each can be at least 150px wide. The picture editor's close button is 44px.

**Desktop is unchanged** from the 23 November release, including its larger text: 13px for the email, status, facts and two-step text, and 11px uppercase labels and role tags. The status border is grey.

**How it's built:**

- At 720px and below the page renders a separate, shorter layout. Screen readers and the keyboard follow the same order you see.
- The Notification switch and two-step sign-in are the same components as on desktop. The switch gains a "row" style, and two-step gains a compact mode that starts closed.
- Frontend only. No backend change, migration, flag or setting.

**Not changed here:** some text sizes come from site-wide rules and belong to a later clean-up:

- the 10px "PERSONAL ACCOUNT" label (desktop and the picture editor)
- the 12.5px desktop intro
- the 11px two-step form labels

## Verification (local)

- All 32 frontend suites, lint, the frontend build, and type checks with TypeScript 6.0.3 (as Railway builds) and 5.9.3.
- **`test:account-phone`** (rewritten) renders the page for a fictional account as a phone and as a desktop. It checks:
  - **Phone:** the order of what's shown, what's no longer shown, the email shown once, and the two-step row starting closed.
  - **Desktop:** the layout is unchanged.
  - **Two-step row:** it stays open during setup.
  - **Styles:** 11px only for uppercase labels, 13px otherwise, monochrome tokens, 56px rows, 44px targets, the arrow and the focus outline.
- **Checked signed in, on a local copy.** The local frontend and API ran against an isolated loopback database with a fictional Owner and a long display name.
  - At 440px (the iPhone 16 Pro Max width in the report) the whole page fits on one screen, with or without the two-step row open.
  - Also checked at 320px, and at 1440px, where the desktop layout is unchanged.
  - Two-step row:
    - Opening and closing it worked by tap and by keyboard; the focus outline is 2px white.
    - The password step kept it open with Continue and Cancel at 44px. Nothing was submitted.
    - The "authenticator on" state was checked by having the browser tab return that status for display only. Nothing was saved.
  - The picture editor opened from the picture, and its close button measured 44 × 44px.
  - The local browser blocks notifications, so the "blocked" explanation was seen. The switch itself wasn't turned on.

  Staging itself was not checked signed in.

## Staging acceptance

1. On a phone, open My Account. You see your picture, name, email and role in the middle, then a card with Notification and Two-step sign-in, then one grey Last sign-in line. Nothing else.
2. Notification turns notifications on and off as before.
3. Two-step sign-in shows "Email codes" (or "Authenticator app"). Tap it: the explanation and button appear. Tap again: they fold away.
4. Tap your picture: the editor opens as before.
5. On a desktop, the page looks as before.
