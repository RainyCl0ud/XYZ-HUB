# Strike screen on phones: View employee strikes

Staging candidate, 25 November 2026. Production is outside this release.

On a phone, a strike's screen in Strike Management ended with a plain "Employee profile ›" row under the person's other strikes. On desktop, the same place is reached from the "View Employee Strikes" button, so the two names didn't match. The row also looked like one more item in the list, not a way to leave the screen. Rainheart approved the drawn proposal.

## What changes (phones, 720px and below)

- **One box:** the person's other strikes sit in a box. It holds the label (for example "Chris Wilson · 2 other strikes" or "No other strikes") and one row per strike, as before.
- **A short note** at the end of the box: "Their standing, deduction and full strike history are on their profile."
- **A full-width outlined button, "View employee strikes"**, named as on desktop.
  - It opens the person's profile on its Strikes tab, and the profile's back link returns to this strike.
  - Screen readers hear the note as the button's description.
- **When the button shows:** the conditions are unchanged. The person must still have an account, and you must be able to view employee profiles, as with desktop's button. Without that, the box shows the label and the rows only.

**Unchanged:**

- "Void this strike" at the bottom, and every other part of the screen.
- Desktop: no desktop file changed, and every new style is inside `@media (max-width: 720px)`.
- No backend change, migration, flag or setting.

## Verification (local)

- **Automated:** all 37 frontend suites, lint and the build, and type checks with TypeScript 6.0.3 (as Railway builds) and 5.9.3.
- **`test:strikes-phone` now covers:**
  - the note and button, in order
  - the button opening the profile
  - the box with no other strikes
  - no button without profile access
  - the name matching desktop's button
  - the box and button styles
- **Checked signed in, on a local copy** with a fictional Owner account and fictional strikes:
  - At 375 × 812, a strike with one other strike showed the box, the note and a 44px "View employee strikes" button.
  - The button opened the profile on Strikes, with "‹ Strike Management". Back returned to the same strike's screen.
  - At 320 × 640, a strike with no other strikes showed "Yara Finch · No other strikes", the note and the button. Nothing was wider than the screen.

Staging itself was not checked signed in.

## Staging acceptance

1. On a phone, open a strike in Strike Management and scroll to the end. The person's other strikes are in a box that ends with "View employee strikes".
2. Tap it. The profile opens on Strikes, and its back link returns to the strike.
3. On a desktop, the strike window still has its "View Employee Strikes" button and looks as before.
