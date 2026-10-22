# Chat usability update — staging only

The initial Chat panel sized itself to its contents inside the Hub's flex layout. This left most desktop space unused and crowded the transcript and composer. Showing every creator's channels in one continuous list also made conversation discovery difficult.

## Changes

- Explicit full-width page with bounded, independently scrolling conversation list and message history.
- Creator/workspace selector instead of an unbroken list of every creator's channels.
- Search within the selected workspace, All/Channels/Private filters and a clear-filters recovery action.
- Separate channel and private-chat groups, visible current selection and archived labels.
- Private-chat notice, readable member permissions and a closable “Who has access” panel.
- Date separators, clearer empty and read-only states, edit/cancel controls, character count and Ctrl/Cmd+Enter send shortcut. Enter alone still inserts a new line.
- Phone Browse view replaces the transcript while choosing a conversation; it does not require interacting with a narrow overlay.
- Plain-language channel-access choices: No extra access, Read messages, Read and send. Existing combined-permission behavior is unchanged.

## Validation

- Frontend production build and lint.
- Authenticated local browser checks using the existing isolated Postgres rehearsal database and made-up accounts: creator switching, search and no-results recovery, private filtering, sending by keyboard, editing, private-member listing and settings display.
- Owner sees management controls; Creator-only sees one protected private chat; Developer has no composer and reads only; Chatter does not see Trial feedback or another person's private chat.
- Desktop/tablet layout checked; phone widths of 390px and 320px have no horizontal document overflow. At very short heights the Hub can scroll vertically to reach controls.

No Backend source, API, schema, migration, account assignment or permission rule changes. No Railway command or variable changes are needed. Publish only to staging; Production remains unchanged.
