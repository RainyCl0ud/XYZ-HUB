# No more "!" markers

Staging candidate, 22 November 2026. Production is outside this release.

The owner decided that messages, buttons, badges and toasts should not lead with a "!". Errors are already marked by their bold, white-bordered box, and the "!" read as unfinished. The design reference (`docs/xyz-design-reference.md`) now says so.

## What changes

- **Error messages** no longer start with "!" on: the sign-in code screen, My Account two-step sign-in, Clock (load errors and Time corrections), the notification bell, the Audit Log Email delivery and Retained channels tabs, and Chat.
- **My Account:** the button that turns off the authenticator now reads "Turn off", and the low recovery codes note drops its "!".
- **Clock:** the 14-hour open shift notice drops its "!".
- **Audit Log:** the Email delivery tab badge shows the number of items that need attention, or a small square dot when the delivery status needs a look. Screen readers still hear "needs a look" or the count. The status title drops its "!".
- **Toasts:** the icon is now "✕" for errors and "△" for warnings, instead of "!".
- **Chat:** the "!" that CSS added before errors, the delete confirmation and delete buttons is gone. They keep their heavy white borders.

Frontend only. No backend change, migration, flag or setting.

## Verification (local)

- All 27 frontend suites. A new `test:no-alert-marks` scans every frontend source file and fails if a "!" marker comes back.
- Lint, the frontend build, and type checks with TypeScript 6.0.3 (as Railway builds) and 5.9.3.

## Staging acceptance

1. On the sign-in code screen, press **Verify** with no code. The message reads "Enter the 6-digit code." with no "!".
2. In **My Account → Two-step sign-in**, start **Turn off**. The button reads "Turn off".
3. Trigger any error toast, for example by saving something with the network off. Its icon is "✕".
4. As the Owner, open **Audit Log**. If Email delivery needs attention, the tab shows a number or a small dot, with no "!".
5. In Chat, open a message's delete confirmation. There's no "!" before the text.
