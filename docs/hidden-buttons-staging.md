# Buttons hidden by permission now really hide

Staging candidate, 25 November 2026. Production is outside this release.

## The problem

Several pages hide a button from people who lack its permission by giving it the `hidden` attribute. Buttons styled with `.primary-button`, `.secondary-button` or `.danger-button` get `display: inline-flex` from the shared stylesheet, and that beat the browser's own `[hidden]` style.

As a result, people without the permission still saw these buttons. Clicking one did nothing, or opened a page they couldn't use.

The independent review of the Creator Management phone layout found this on the desktop "Add creator" button. The same cause affected ten buttons on six pages:

| Page | Button | Hidden without |
| --- | --- | --- |
| Creator Management | Add creator | `models.create` |
| Employee Management | Invite person | `people.create` |
| Employee Management (selected people) | Change team, Change role | organisation management, `people.assign_roles` |
| Employee profile, Overview | Edit | `people.assign_roles` |
| Rules | Add Rule, Rule settings | rule management |
| Strike Reasons | Add Reason | strike reason create |
| Strike Management | Reasons, Strike Ladder settings | viewing reasons or the ladder (each hidden separately) |

## The fix

One rule in the reset section of `index.css`:

```css
[hidden] {
  display: none !important;
}
```

The `hidden` attribute now always hides. Text buttons such as Creator Management's Rename and Deactivate were already hidden correctly, because nothing gives them a display.

**Unchanged:**

- Buttons that people can use look and behave the same. The only other `hidden` element is Chat's file picker input, which was already hidden.
- **One small visible difference:** Employee Management's "Invite person" now appears once the page's options have loaded, instead of showing disabled before that. It also stays hidden if that request fails, but it couldn't be used in either case.
- Phone layouts don't depend on it.
- No backend change, migration, flag or setting.

## Verification (local)

- **Automated:** all 39 frontend suites, lint and the build, and type checks with TypeScript 6.0.3 (as Railway builds) and 5.9.3.
- **New `test:hidden-controls` checks that:**
  - `index.css` has the rule with `!important`
  - no stylesheet gives `[hidden]` elements a visible display
  - no `display: … !important` rule targets a class that a hidden button uses, since such a rule would bring the button back. Adding one on purpose made the test fail and name the affected pages.
- **Checked signed in, on a local copy with fictional accounts, at 1440px:**
  - **A fictional Dev account with Creators access but no permission to add creators** (granted locally for the check, then removed):
    - "Add creator" had `display: none`.
    - Removing the new rule in the browser brought the button back at 106px wide. That is the bug on Staging.
    - Rename and Deactivate were already hidden.
  - **A fictional Quality Control account** saw only Issue Strike in Strike Management.
  - **The fictional Owner** still saw everything: Issue Strike, Reasons and Strike Ladder settings; Add creator, Rename and Deactivate; Invite person.

Staging itself was not checked signed in.

## Staging acceptance

1. Sign in as a role that can view Creators but not add creators, if one exists on Staging. "Add creator" doesn't show.
2. As an Owner, every button above still shows and works.
