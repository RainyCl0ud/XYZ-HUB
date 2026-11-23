# My Account on phones

Staging candidate, 24 November 2026. Production is outside this release.

The first phone version (23 November) fixed alignment and text sizes but still showed a lot. Rainheart found it crowded, with too much text. The page now has its own short phone layout, built from the sketch Rainheart approved.

## What changes

**Phones (720px and below)**

From top to bottom:

1. **Profile, centred:** a larger picture (84px) with the camera badge, then the name, email and role tags. Long names, emails and role names wrap.
2. **Settings card:** two 56px rows.
   - **Notification:** the switch on the right, with a 44px tap area.
     - It explains itself only when it can't be used: notifications blocked, unsupported or unavailable in this browser, or an error.
   - **Two-step sign-in:** shows the current method, "Email codes" or "Authenticator app", with an arrow.
     - Tap it to open the explanation and its buttons. Tap again to close it. The arrow points down while it's open.
     - Once the authenticator is on, opening it shows when it was turned on, how many recovery codes are left, and the two buttons, Get new recovery codes and Turn off.
     - During setup (password, QR code, recovery codes), or after an error, the row stays open.
     - If the settings can't load, the row says "Not available" and offers Try again.
3. **Last sign-in:** one grey line, for example "Last sign-in Nov 22, 2026, 9:51 AM CST".

**No longer shown on phones:**

- The "My Account" heading. The top bar already shows it, and screen readers still hear the heading.
- The "PERSONAL ACCOUNT" label and the intro sentence.
- The PROFILE label.
- "Account status: Active". Anyone who can open the page is active.
- The second email row.
- The long two-step explanation, until the row is opened.

**Other phone details:**

- Buttons are full width and 44px tall; two share a row when each can be at least 150px wide.
- The picture editor's close button is 44px.
- Buttons and field labels are 13px.
- The password and code fields are 16px, so iPhones don't zoom in when they get focus.
- The picture's keyboard focus ring goes around the camera badge.

**Rotating or resizing keeps your place.** Rotating the phone, resizing the window or zooming can cross 720px mid-task. If setup is in progress (the password, the QR code, or the one-time recovery codes), it stays on screen. An open picture editor stays open.

**Desktop is unchanged** from the 23 November release, including its larger text: 13px for the email, status, facts and two-step text, and 11px uppercase labels and role tags. The status border is grey.

**How it's built:**

- Both layouts come from one page. At 720px and below it shows the short layout, so screen readers and the keyboard follow the order you see.
- Two-step sign-in and the picture editor are rendered from the same place in both layouts; only their style changes.
- The Notification switch gains a "row" style. Two-step sign-in gains a compact mode that starts closed.
- Frontend only. No backend change, migration, flag or setting.

**Not changed here:** some desktop text sizes come from site-wide rules and belong to a later clean-up:

- the 10px "PERSONAL ACCOUNT" label (desktop and the picture editor)
- the 12.5px intro and buttons
- the 11px two-step form labels
- the 12px fields

## Verification (local)

- All 32 frontend suites, lint, the frontend build, and type checks with TypeScript 6.0.3 (as Railway builds) and 5.9.3.
- **`test:account-phone`** (rewritten) renders the page for a fictional account as a phone and as a desktop.
  - **Phone render:** the order of what's shown, what's no longer shown, the email shown once, and the two-step row starting closed.
  - **Desktop render:** keeps its pieces (header, status, facts, two-step card).
  - **The page's code:**
    - One layout renders two-step sign-in and the picture editor from a single place.
    - The two-step row stays open mid-step and recovers from a failed load.
  - **Styles:** 11px only for uppercase labels, 13px otherwise, monochrome tokens, 56px rows, 44px targets, 16px fields, the arrow and the focus outlines.
  - A server render can't run the page's data loading, so the loaded states were checked in the browser instead.
- **Checked signed in, on a local copy.** The local frontend and API ran against an isolated loopback database with a fictional Owner and a long display name.
  - At 440px (the iPhone 16 Pro Max width in the report) the whole page fits on one screen, with or without the two-step row open.
  - Also checked at 320px, and at 1440px, where the desktop layout is unchanged.
  - Two-step row:
    - It opened and closed by tap and by keyboard; the focus outline is 2px white.
    - The password step kept it open, with Continue and Cancel at 44px, a 13px label and a 16px field.
  - Rotating or resizing:
    - With the password step open, switching 440px → 1024px → 440px kept the step.
    - With the picture editor open, it stayed the same element throughout.
  - These states were checked by having the browser tab return the status, for display only. Nothing was submitted or saved.
    - Authenticator on: "Authenticator app", the date, the recovery-code count and its two buttons.
    - Settings that fail to load: "Not available", the error, then Try again loads them and the row closes.
  - The switch's tap area measured 44px.
  - The picture editor opened, and its close button measured 44 × 44px.
  - The local browser blocks notifications, so the "blocked" explanation was seen. The switch itself wasn't turned on.

  Staging itself was not checked signed in.

## Staging acceptance

1. On a phone, open My Account. You see your picture, name, email and role in the middle, then a card with Notification and Two-step sign-in, then one grey Last sign-in line. Nothing else.
2. Notification turns notifications on and off as before.
3. Two-step sign-in shows "Email codes" (or "Authenticator app"). Tap it: the explanation and button appear. Tap again: they fold away.
4. Tap your picture: the editor opens as before. Rotate the phone: it stays open.
5. On a desktop, the page looks as before.
