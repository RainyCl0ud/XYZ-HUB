# Clean-up batch 1

Staging candidate, 22 November 2026. Production is outside this release.

These are the first items from the page-by-page clean-up review that the owner approved.

## What changes

1. **Dashboard: readable data scope.** Staff without the agency overview saw the raw setting ("SELF_AND_TEAM"). They now see "All data", "Self + subordinates" or "Self only", the same labels as People. One shared helper (`frontend/src/lib/data-scope.ts`) replaces the copies in the two People pages.
2. **No more salmon-red.** The danger colours are now monochrome, like success, warning and info already were.
   - **Error banners** on the sign-in, forgot-password, invite, People, Creators, Role Settings and Audit Log pages get a 2px white border and bold white text.
   - **Destructive buttons**, including the Sign out dialog and delete/void confirmations, get a heavy white border on black instead of a red fill.
   - **Other red tints**: the Sign out menu item, error toasts, "Voided" chips, the People Danger Zone and removed-change chips become white or grey.
   - **Inactive creator options** on People lose their red stripes for a dashed grey border.
   - **Strikes and My strikes:** error messages were dark red on black and nearly unreadable. They now get a white border and bold white text, and the void history boxes lose their red tint.
   - **Chat:** the deleted-message toggle and reaction errors were salmon. They're now grey and white.
3. **11px minimum in the shell.** Header labels, sidebar section headings, the account menu, the header clock, and both confidentiality footers (app and sign-in pages) are now at least 11px. They were 6–10px. On tablets and phones, the header hides the date, which was under 6px and unreadable. It shows the time at 11px with its zone, for example "12:45 PM CST", so it isn't read as local time. On phones the footer wraps to two lines.
4. **Clock copy.**
   - The 14-hour notice now says to ask for a correction in **My requests**, with a link. It used to say "Time corrections below". The sentence shows only to people who can request corrections.
   - The week reads "Week of Nov 16" instead of "2026-11-16".
   - The hours table column "Counting rule" is now "Includes".

## Checked and left as is

- **The Dashboard "Coming later" card stays.** The Block 2 brief (Section 9 and the acceptance list) requires "coming later" wherever data doesn't exist yet, naming revenue, commission sheets and the schedule.
- **The Chat page title is unchanged.** On desktop the header doesn't show page titles at all. Only the phone header shows one, and there Chat falls back to "XYZ Management".

Frontend only. No backend change, migration, flag or setting.

## Verification (local)

- All 28 frontend suites, including the new `test:cleanup-batch1`. It checks the data scope labels, that no salmon-red is left in the active CSS, the destructive button and error styles, the 11px minimum, and the Clock copy and week label.
- Lint, the frontend build, and type checks with TypeScript 6.0.3 (as Railway builds) and 5.9.3.
- In a local preview of the sign-in page at 375px, the footer is 11px and wraps without overflow, and the danger colour resolves to white. The signed-in header and pages were not checked visually.

## Staging acceptance

1. Sign in as a staff member without the agency overview. The Dashboard shows "Data scope: Self only" (or the matching label), never a raw value.
2. Open the account menu and choose **Sign out**. The menu item and the confirm button are white, with no red.
3. Enter a wrong password on the sign-in page. The error box has a white border and bold text.
4. Check the header, the sidebar headings and the footer on desktop and on a phone. No text is tiny, and on a phone the header shows the time with CST/CDT and no date.
5. On Clock, the week reads like "Week of Nov 16, Monday to Sunday", and the column says "Includes".
6. On **Strikes**, trigger an error, for example by submitting a form with a required field empty. The message is bold white in a white-bordered box, not dark red.
