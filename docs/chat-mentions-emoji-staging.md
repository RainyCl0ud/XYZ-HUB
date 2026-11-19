# Chat mentions, unread navigation and emoji library

Staging candidate, 20 November 2026. Production is outside this release.

## Staff behavior

- The reaction picker offers all 3,972 keyboard/display entries in Unicode Emoji 18.0, including skin tones, flags and joined sequences. Search, categories and pages of 80 keep the picker usable. Six is only the per-account, browser-local recent history limit. A message can have more than six different reactions. A failed save stays visible in the picker and can be retried.
- Channels and Private each display their own unread badge. The unread-only label counts the current tab. An empty unread tab links directly to unread conversations in the other tab, and switching tabs preserves the filter.
- Type `@` and select a current conversation member, using the mouse or Arrow keys and Enter/Tab. Only an explicit selection creates a mention. The server rechecks the sender's posting permission and each recipient's current visibility in that conversation, including private conversations and quarantine. Names with the same spelling remain distinct identities. Editing a selected name removes the mention; surrounding edits preserve it.
- The sidebar Chat badge counts unread received messages that mention the viewer. Multiple mentions in one message count once. Ordinary unread messages, self mentions, deleted messages, inaccessible conversations and archives do not inflate the badge. Its link and the Mentions button open an inbox with direct message navigation. Existing visible-message and explicit conversation read acknowledgements clear the count; opening the inbox alone does not.
- Counts refresh every five seconds in visible tabs, on window focus and immediately after local read acknowledgements. Browser/email notification delivery settings are unchanged.

The catalog is generated from https://www.unicode.org/Public/emoji/latest/emoji-test.txt (version 18.0 verified at preparation). The generated files are committed, so runtime never downloads the library. Unicode's license is retained in `emoji-data-license.txt`. Emoji appearance depends on the viewer's device/fonts; unavailable glyphs do not prevent choosing a named entry.

## Data and deployment

Two new migrations follow the existing staging migrations. `20261120010000_chat_mentions` adds message/recipient identities and UTF-16 text offsets, indexed for unread queries. `20261120020000_full_chat_emoji_library` adds the 5,244 accepted Unicode qualification forms and replaces the old 24-item reaction check with a foreign key to that catalog. It preserves existing reactions. Messages and user/read/attendance records are not rewritten. Older messages without selected mention metadata remain plain text and do not create a historical mention backlog.

Use the existing staging build, migration and deployment workflow. No delivery mode, feature flag or provider changes are needed. Application rollback should retain the additive tables. Old application code still limits available picker choices to its own old palette.

## Verification

- New backend suite: 9 integration groups for identity, retry safety, access boundaries, quarantine, private-chat isolation, edits/deletions, reads, pagination, full-library reactions and strict authenticated HTTP.
- Existing interaction suite: 23 groups; existing unread suite: 11 groups.
- Upgrade rehearsal 36 → 38: every row in all 48 prior tables retained exactly, including a seeded message, reaction and receipt; a long joined emoji succeeds, invalid strings remain rejected and repeated deploy is unchanged.
- Frontend mention offset/rendering checks; reaction picker 9 groups; existing Chat UX 8 groups and message compatibility suite; frontend lint and both builds.
- A local browser fixture exercised the actual application: seven reactions, failed save/retry, private unread navigation, member-only keyboard selection, sidebar mention inbox and read clearing, and a viewport-bounded picker at 390px width. Screenshots were inspected.

The isolated regression databases are loopback-only. The browser fixture uses fictional people and intercepted API responses. These checks prepare the staging release; they are not signed-in shared-staging acceptance or physical mobile-device testing.

## Staging acceptance

1. In two test accounts in one conversation, add at least seven distinct reactions and choose an emoji outside the former palette. Search and change category; confirm recents remain six.
2. Send an ordinary unread private message while the recipient browses Channels. Confirm the Private badge and the empty unread tab link identify it.
3. Type `@`, select a permitted member and send. Confirm only that recipient's sidebar badge increases; an ordinary message leaves that badge unchanged.
4. Open the Mentions inbox, then its message. Confirm the count clears after viewing. Check a private chat, another workspace and a paused member to verify the picker and server boundaries.
