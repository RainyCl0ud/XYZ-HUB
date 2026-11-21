# Two-step sign-in code screen redesign

Staging candidate, 22 November 2026. Production is outside this release.

## What changes

The screen after the password (`/verify-2fa`) has a new layout. The same layout serves the authenticator app, a recovery code and an emailed code.

- **Clearer heading and copy.** The eyebrow says "Two-step sign-in", the same name as the My Account card. Titles are "Enter your code", "Use a recovery code" and "Check your email". The descriptions are shorter, in light grey (#CCCCCC) and 13px.
- **"Signing in as ‹email›"** appears under the description for authenticator sign-ins. The footer becomes "Not you? Sign in again".
- **Six code boxes.** They are drawn over one real input, so pasting a code and phone or password-manager autofill still work. The code is checked as soon as the sixth digit is in, without pressing Verify. After a wrong code the boxes clear for the next try (an app's code changes every 30 seconds). A wrong recovery code stays selected, so a typo is quick to fix. The typing position always stays at the end of the code, and a spaced paste like "123 456" works.
- **One white "Verify" button.** It is no longer greyed out before the code is complete. Pressing it early says "Enter the 6-digit code." The button is only disabled while a code is being checked.
- **"Other ways to sign in"** replaces the two small underlined links with full-width outlined buttons and icons: **Use a recovery code** (or **Use my authenticator app**) and **Email me a code**.
- **Errors** follow the web kit: a 2px white border, bold text and a leading "!" (not read aloud). If the sign-in is locked, expired or used up, the screen ends with a white **Sign in again** button instead of taking more codes.
- **Focus is always visible.** The box the next digit goes into gets a white ring with a blinking caret. The caret stays still when reduced motion is on. Windows High Contrast uses system colours and keeps the hidden input hidden.

Sign-in behaviour, endpoints and rate limits are unchanged. Frontend only: no backend change, migration, flag or setting.

## Verification (local)

- All 26 frontend suites. `test:authenticator-ui` now checks the new layout, the six boxes over one input, sign-in on the sixth digit, no double submit, the always-available Verify button, the other-ways buttons and monochrome tokens.
- Lint, the frontend build, and type checks with TypeScript 6.0.3 (as Railway builds) and 5.9.3.
- Checked in a local preview with a placeholder pending sign-in. No code was submitted. Covered: the authenticator, recovery and emailed versions; partial typing and focus; the typing position staying at the end after arrow keys; the 16px input; the early-Verify message; phone width (375px).

## Staging acceptance

1. Sign in with a password on an account that uses an authenticator app. The screen says "Enter your code", "Signing in as ‹your email›", and shows six boxes.
2. Type or paste the 6-digit code from the app. It signs in as soon as the sixth digit is in.
3. Sign in again and enter a wrong code. A bold "!" message appears, and the boxes clear and keep focus. After too many wrong codes, the screen shows only **Sign in again**.
4. **Use a recovery code** switches to the recovery field, and **Use my authenticator app** switches back.
5. **Email me a code** sends an email and switches to "Check your email" with six boxes.
6. On a phone, the boxes fit the card, and the phone offers the code from its keyboard or password manager.
