# Chat access shown as it really is

Staging candidate, 21 November 2026. Production is outside this release.

## What changes

- **Channel settings → Permissions** now say **No access**, **Can see** or **Can post** everywhere, for roles and for members. These replace "No role grant", "No individual grant", "See" and "Post".
- **Each menu shows the access the person or role actually has.** A member whose role already lets them post shows **Can post**, not "No individual grant". The line under their name explains where it comes from: "From their role: Can post".
- **Role access is the minimum.** For a member, choices below what their role gives are greyed out, and a member whose role already gives **Can post** is locked, because there's nothing to add. A role that Role Settings already lets see or post in every channel works the same way ("All channels (Role Settings): …").
- **Saving the minimum clears any extra grant** saved for that member or role, so no leftover grant hides behind the role access.
- **Audit Log** grant changes use the same words: "Can post", "Can see" and "Not granted here". The last one means no extra grant in this channel; any role access still applies.

Frontend wording and display only, plus the Audit Log wording. Access rules are unchanged: the most generous of role and member access still applies. No migration, flag or setting.

## Verification (local)

- Frontend: all 26 suites (`test:chat-grant-copy` now checks the labels, the role minimum, the locked state and clearing an extra grant), lint, the frontend build, and type checks with both TypeScript 6.0.3 (as Railway builds) and 5.9.3.
- Backend: `test:creator-chat` (25), the audit presentation suite, the build, and a TypeScript 6 check.

## Staging acceptance

1. As the Owner, open a creator's **#General → Settings → Permissions → Member**. Alex Rivera (role access Post) shows **Can post**, with "From their role: Can post", and the menu is locked.
2. A member whose role only gives **Can see** shows **Can see**. **No access** is greyed out, and choosing **Can post** then **Save** gives them posting.
3. Set that member back to **Can see** and save. They keep seeing the channel through their role, and the extra grant is gone.
4. Under **Role**, a role with no access shows **No access**, and choosing **Can see** works.
