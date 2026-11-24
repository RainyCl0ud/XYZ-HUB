# Chat on phones

Staging candidate, 25 November 2026. Production is outside this release.

## The problem at 375px

- **Conversations panel:**
  - The "Conversations" title, the creator picker, the Channels/Private tabs and "Unread only" took 254px before the first channel, so only about 7 of 13 channels fit.
  - Rows were 39px tall with 12.5px text.
- **A conversation:**
  - It sat in a bordered box with margins.
  - Its "Browse conversations" button was a second ☰ right under the app's ☰.
  - The send button was 90px wide, which squeezed the message field to 175px.
  - "Type @ to mention" took its own row.
- **iPhone zoom:** the message field and the creator picker used 12.5px text, so iPhones zoomed in on tap.
- **"Chat options":** people who can post staff announcements got a whole row for that one item.

Rainheart approved the drawn proposal.

## What changes (phones, 720px and below)

**Chat opens on the conversation list**, like a messaging app:

- **First row:** the creator picker (16px, with a chevron, showing "· N unread") and a **⋯** menu. The menu holds:
  - **Show unread only** (or "Show all conversations")
  - **New channel**, under the same condition as desktop's button
  - **Staff announcements**, for people who can announce
- **Moved into ⋯:** the "Chat options" row, the "Unread only" button and the "+ New channel" footer.
- **Unread only:** while it's on, a "Unread only ×" button above the list shows it and turns it off.
- **Tabs:** Channels and Private share the width, with their unread counts.
- **Rows:**
  - 50px tall with 15px names.
  - Conversations with unread messages are white and bold, with a white count.
  - The open conversation keeps its white line.
  - About 9 channels now fit instead of 7.

**Tap a conversation to open it full width:**

- **Header:**
  - A **‹ back arrow** to the list replaces the second ☰.
  - The conversation's name has its creator in grey under it.
  - Members and ⋯ (Search, Pinned, Deleted messages, Channel settings) stay.
- **Composer:** + and send are 44px squares, and the message field takes the rest of the row at 16px. The "@ to mention" hint row goes; @ mentions still work. The length warning near 8,000 characters stays.
- **Messages area:** 564px tall at 375 × 812, up from 511px.

**Unchanged:**

- **Desktop.** At 1440px the Chat HTML matched Staging's, except for the phone-only back button, which is hidden at desktop widths.
- **Links that name a conversation** (notifications, `?conversation=`) still open that conversation directly. Back then shows the list.
- **Crossing 720px** shows desktop's side-by-side layout. Coming back shows the open conversation.
- Messages, permissions, moderation, attachments, voice messages and read tracking. Read tracking stays paused while the list is showing, as it was while browsing.
- No backend change, migration, flag or setting.

## How it's built

- **`ChatPage`:**
  - It reads `useMediaQuery(PHONE_QUERY)`.
  - It starts with the list showing on phones unless a link names a conversation.
  - It resets the list and menu when crossing 720px, adjusted while rendering.
- **Phone-only pieces:** the section gets `creator-chat-phone`, and phones render the ⋯ menu (the shared `PhoneActionMenu`) and the creator line. The back button, which was already phone-only, now shows a chevron labelled "Back to conversations".
- **Styles:** one `@media (max-width: 720px)` block at the end of `ChatPage.css`. Every selector starts with `.creator-chat.creator-chat-phone`, so it beats Chat's older phone rules without touching them. It uses only the design reference's greys.

## Verification (local)

- **Automated:**
  - all 40 frontend suites, including Chat's 17 existing suites, unchanged
  - lint and the build
  - type checks with TypeScript 6.0.3 (as Railway builds) and 5.9.3
  - new `test:chat-phone`: list first, the link exception, the 720px reset, the ⋯ menu's items and conditions, the back arrow, the creator line, and every phone style (scope, sizes, palette, 44px targets, 16px fields)
- **Checked signed in, on a local copy** with fictional accounts. The local test database got Chat's default channels from the backend's own provisioning script, and a fictional "Quinn Harper" posted two messages.
  - **At 375 × 812:**
    - Chat opened on the list. Rows were 50px, 9 fit fully, the picker was 16px, and nothing was under 13px or 44px.
    - ⋯ showed Show unread only and New channel. Unread only showed the "Unread only ×" button and the empty state; tapping it showed all again.
    - With Quinn's messages, the picker read "Lena Park · 2 unread", the Channels tab showed 2, and General was bold with a "2" badge.
    - Opening a channel showed back, the name with "Lena Park" under it, Members and ⋯. The message field was 247px wide at 16px, and + and send were 44px.
    - Sending a fictional reply worked.
    - The thread's ⋯ showed Search, Pinned, Deleted messages and Channel settings, and Members opened.
    - Back returned to the list, and switching creators stayed on the list.
    - `?conversation=` opened that conversation directly.
  - **At 320 × 640:** nothing was wider than the screen, and the message field was 192px.
  - **At 1440px:** desktop matched Staging's HTML apart from the hidden back button. The ⋯ menu and creator line don't render on desktop.
  - Going from 1440px back to phone width showed the open conversation.

Staff announcements in ⋯ wasn't seen locally, because the local account isn't set up to send announcements; the code shows it under the same condition as desktop's "Chat options".

Staging itself was not checked signed in.

## Staging acceptance

1. On a phone, open Chat. The conversation list shows first: creator picker and ⋯, then Channels and Private, then the rows.
2. ⋯ shows Show unread only and New channel (if you can manage channels), plus Staff announcements if you can announce. Open Staff announcements and close it without sending.
3. Tap a channel. It opens full width with ‹ back, the creator under its name, and the composer with a wide field. Tapping the field doesn't zoom the page.
4. Back returns to the list.
5. A Chat notification opens its conversation directly.
6. On a desktop, Chat looks as before.
