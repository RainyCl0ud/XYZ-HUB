# Sign in with an authenticator app

Staging candidate, 21 November 2026. Production is outside this release.

## What changes

People can now use a free authenticator app for the second sign-in step instead of waiting for an emailed code. Any standard app works, including Google Authenticator, Apple Passwords (iPhone and Mac, under Verification codes), Bitwarden Authenticator and Microsoft Authenticator. No paid service or account is involved.

- **Optional, per person.** In **My Account → Two-step sign-in**:
  1. Choose **Set up authenticator app** and enter your password.
  2. Scan the QR code, or type the key. On a phone, "open it in your app" adds it directly.
  3. Enter the six-digit code the app shows.
  4. Save the ten one-time recovery codes: copy them or download them as a text file. They aren't shown again.
- **Sign-in:** after the password, people with the app enter its code, and no email is sent. The screen also offers **Use a recovery code** and **Email me a code instead**, so nobody is locked out.
- **Turning it off** or **getting new recovery codes** needs the password. A lost phone is covered by a recovery code, an emailed code, or the Owner's existing **Reset two-factor authentication** in Employee Management, which now also removes the recovery codes.
- **The Audit Log records** when the app is turned on or off, when new recovery codes are issued, and each sign-in with a recovery code.
- **Fewer emailed codes** also leave more of the shared Gmail daily limit for everyone else.

## How it's built

- Standard authenticator codes (TOTP, RFC 6238): six digits that change every 30 seconds, with one step of clock drift allowed. Each code is accepted only once.
- Each person's app secret is encrypted (AES-256-GCM) with a key derived from the existing `TWO_FACTOR_CODE_SECRET`, so no new Railway setting is needed. If that setting is ever changed, everyone must set the app up again.
- Recovery codes are stored only as keyed hashes, and each one works once.
- Sign-in keeps the existing limits: five wrong codes end the attempt, codes expire after 10 minutes, and "Email me a code instead" shares the sign-in rate limit.
- In the app, the account shows as "XYZ Hub Staging" on Staging, so it can't be confused with the live Hub later.
- Migration `20261121050000_authenticator_app` adds a replay guard column and the recovery code table. The existing "authenticator" slot from the original sign-in build is reused.
- New backend package: `qrcode` 1.5.4 (MIT), installed with your approval, to draw the setup QR code.

## Verification (local, loopback PostgreSQL with fictional data)

- New `test:authenticator`, 6 groups:
  - codes match the RFC 6238 test vectors, and secrets are encrypted and tamper-checked;
  - setup needs the password and only switches on after a real code;
  - app sign-in sends no email, and no code is accepted twice;
  - recovery codes work once and are audited; the emailed backup works; five wrong codes lock the attempt;
  - every account change needs the password;
  - the Owner reset clears everything.
- New `test:authenticator-ui` (3 groups).
- Also passed: two-factor, session, session-auth, session-token, People two-factor, password, middleware, access, People read/status/access, live session invalidation, audit presentation and audit database suites, staging regressions, both builds, frontend lint, and all 26 frontend suites.
- `npm audit` reports 4 warnings in packages that were already installed (body-parser, nodemailer, qs, zod), not in `qrcode`. They're worth a separate update.

## Staging acceptance (use a test account and your own phone)

1. Sign in as usual with an emailed code. In **My Account**, choose **Set up authenticator app**, enter the password, and scan the QR code with Google Authenticator, Apple Passwords or Bitwarden Authenticator. The app shows "XYZ Hub Staging".
2. Enter the app's code. Save the recovery codes and confirm.
3. Sign out and sign in. After the password, the screen asks for the authenticator code and no email arrives. Enter the app's code: you're in.
4. Sign in again and choose **Email me a code instead**. An email arrives and its code works.
5. Sign in again and choose **Use a recovery code**. One saved code works; the same code fails the next time.
6. In **My Account**, turn the app off (password required). The next sign-in asks for an emailed code again.
7. As the Owner, check the Audit Log for "Authenticator app turned on/off" and "Signed in with a recovery code".
