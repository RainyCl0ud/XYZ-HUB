# Chat access shown as it really is

Staging candidate, 21 November 2026. Production is outside this release.

## What changes

- **Channel settings → Permissions** now say **No access**, **Can see** or **Can post** everywhere, for roles and members. These replace "No role grant", "No individual grant", "See" and "Post".
- **Each member's menu shows the access they have right now**, after every Chat rule. A member whose role already lets them post shows **Can post**, not "No individual grant". The line under their name gives the source: "From their role: Can post", or "Given in this channel".
- **Role access is the minimum.** For a member, choices below what their role gives are unavailable, and a member whose role already gives **Can post** is locked. A role that Role Settings let into every channel works the same way ("All channels (Role Settings): …").
- **Choices a grant can't give are unavailable, with the reason.** A member whose roles can't send messages shows "Can't post here: their roles don't allow sending messages." A member blocked from the channel (for example a Chatter on #Trial feedback, or someone with a Chat pause) shows "Can't be given access here". Before this change, a grant like that showed as access the person didn't actually have.
- **Leftover grants are visible and can be removed.** A grant here that changes nothing today shows on the line under the name. It reads "· also granted here" when role access already covers it, or "· unused grant here" when it's above what the person can get. Either kind could take effect unnoticed if their roles change, so a **Remove extra grant** button appears. Choosing the minimum and saving also clears it.
- **Role rows** that grant more than the role can use on its own (for example a role that can't send messages, with Can post) say so: "On its own, this role can't send messages (Role Settings), so it can only see." The grant still applies to people who get sending from another role.
- **Audit Log** grant changes use the same words: "Can post", "Can see" and "Not granted here". The last one means no extra grant in this channel; role access still applies.

The access rules themselves are unchanged: the most generous grant still wins, and every restriction still applies. The channel access list (`GET /api/chat/channels/:id/grants`) now also returns each member's current `access` and the `limit` a grant could reach, and each role's `limit`. No migration, flag or setting.

## Verification (local)

- Frontend: all 26 suites (`test:chat-grant-copy` checks the labels, the minimum and limit, the locked state, removing covered and unused grants, and rows following refetched access), lint, the build, and type checks with TypeScript 6.0.3 (as Railway builds) and 5.9.3.
- Backend: `test:creator-chat` (25), which now also checks `access` and `limit` for a restricted #Trial feedback grant, a view-only grant, role-given posting, and the DEV role. Also the audit presentation suite, the build, and a TypeScript 6 check.

## Staging acceptance

1. As the Owner, open a creator's **#General → Settings → Permissions → Member**. Alex Rivera (role access Post) shows **Can post** with "From their role: Can post", and the menu is locked. If they also have an old grant here, the line ends with "· also granted here", and **Remove extra grant** removes it while they keep posting.
2. A member whose role only gives **Can see** shows **Can see**, and **No access** is unavailable. Choose **Can post**, then **Save**: they can post.
3. Set that member back to **Can see** and save. They still see the channel through their role, and the extra grant is gone.
4. Under **Role**, a role with no access shows **No access**, and choosing **Can see** works.
5. In **#Trial feedback**, a Chatter-only member shows **No access** with "Can't be given access here", and the menu is locked. If they have an old grant here, the line ends with "· unused grant here", and **Remove extra grant** removes it.
