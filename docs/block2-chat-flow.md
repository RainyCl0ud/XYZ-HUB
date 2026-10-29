# Chat flow cleanup — October 29, 2026

This frontend-only follow-up addresses the user's request to improve the whole moderation/navigation flow. Server permissions, retained-history policy, APIs, database schema and Railway settings are unchanged.

## Changes

- Reply and React stay on the message; **More** contains permitted Edit, Pin/Unpin, History and a clearly separate **! Delete message…** action. Read-only/deleted message capabilities still come from the server. Menus close on outside click or Escape; Escape closes the open disclosure before the surrounding dialog. Expanding a menu keeps it reachable in its scroll container.
- Search → message → history has a Back trail. Search query, scope, loaded page cursors and scroll position are restored; results are fetched again under current access rather than retaining cached private excerpts. Context includes creator/workspace and conversation. **Go to latest conversation** explicitly describes its destination.
- Owner history puts the newest activity first; the duplicate current/retained message preview is expandable rather than pushing the activity below the fold.
- Deletion keeps the underlying message/search screen open. Cancel returns there. The confirmation fetches the latest message and permission before enabling deletion, identifies author/time/conversation and pin removal, explains Owner retention/no Undo, requires a reason and gives a character count. An edit conflict keeps the reason and offers **Check message again**. An interrupted/uncertain deletion requires a read/check before another delete; access denial hides the preview. Busy deletion cannot be dismissed. The underlying tool refreshes on return; success appears there, with keyboard focus restored.
- In-memory drafts survive conversation changes and reselecting the same conversation. Starting/cancelling/saving an edit restores the ordinary draft. Deleted reply sources detach without deleting the typed text. A message-level action error rechecks the conversation without assuming the whole conversation is forbidden. Genuine conversation denial still clears access-sensitive state and removes its cached draft. Drafts are not stored on disk and do not survive leaving/reloading Chat.
- Concurrent edits preserve the user's edit, show the latest sent text and require explicit review before saving over the new version. Unchanged edits cannot be submitted. Channel/workspace switching is disabled while sending. Conversation filters explicitly say that filtering the list does not switch the current conversation.
- Existing XYZ monochrome tokens, typography, borders, focus treatment and confidentiality footer retained; management controls stack with 44px targets on phones.

## Verification

Frontend build, lint and actual component rendering checks cover legacy API readability, hard Owner/deleted presentation, redacted replies and separated server-capability controls. Existing backend moderation/security tests were not changed; no backend implementation changed in this follow-up.

Local browser walkthrough used disposable Owner data and normal existing login: draft switch/return; edit cancel restoring ordinary draft; search → message → history → Back → original search; deletion from search with fresh review; forced concurrent edit causing 409, retained reason and successful Check message again; Cancel returning to the same result with focus; a second concurrent composer edit blocking overwrite until review, then saving and restoring the ordinary draft; successful deletion retaining the navigation trail and Owner history. 390px phone confirmation inspected with no horizontal page overflow. Browser error log is inspected separately; the intentionally forced 409 is expected, not an unexplained failure.

Staging rollout only. No new migration, credential, flag, seed, reset or Production rollout. New UI walkthrough remains pending user confirmation after deployment; previous functional Chat/Clock/moderation acceptance remains recorded as passed.
