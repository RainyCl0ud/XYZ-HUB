# Header redesign

Staging candidate, 22 November 2026. Production is outside this release.

The top bar was busy: three small caps labels ("Creator context", "Role", "US Central"), a three-line clock, and the role as the boldest text in the header. It's now one tidy row.

## What changes

**Desktop (721px and up)**

- **Creator picker:** "CREATOR" sits beside a compact menu, about 160px wide (it was about 340px), and only as wide as it needs to be.
- **Clock:** one line plus a date, for example "6:25 AM CST" over "Sun, Nov 22". Hovering the date shows the full date. The "US Central" label is gone, since CST/CDT says the same thing.
- **The signed-in person** now appears in the account button: avatar, name and role (for example "Rainheart / Owner"), plus a ▾ arrow. The design reference asks for this ("signed-in person on right"). The separate "Owner / ROLE" block and its divider are gone.
- **One height:** the picker, bell and account button are all 32px, with even spacing. The right side reads time, bell, person.
- **721–1023px:** the account button shows the avatar only, so nothing overlaps. The menu still shows the name and role.

**Phones (720px and below)**

- The header shows time, bell and avatar on one row. Previously the bell took the avatar's spot, so the avatar wrapped onto a second row and overlapped the bell, and the bell sat partly above the screen. This had been the case since the bell was added.
- Otherwise phones are unchanged. The time shows its zone, the date stays hidden, and the creator picker is still full width under the header.

The picker, bell and account menu work exactly as before. Frontend only: no backend change, migration, flag or setting.

## Verification (local)

- All 29 frontend suites. The new `test:header-redesign` checks the markup, the clock text in US Central, the 32px row, the narrow-desktop fallback and the phone row. `test:cleanup-batch1` was updated for the clock.
- Lint, the frontend build, and type checks with TypeScript 6.0.3 (as Railway builds) and 5.9.3.
- **Checked signed in, on a local copy.** The local frontend and API ran against an isolated loopback database with a fictional Owner and creator. Checks covered:
  - 1440, 1280, 1024, 900, 721 and 375px widths, with no overlaps and no horizontal scroll
  - the account menu opening right-aligned under the button, with a white border when open
  - the bell panel opening under the bell
  - the Dashboard (with the picker) and the Audit Log (without it)

  Staging itself was not checked signed in.

## Staging acceptance

1. On a desktop, the header reads "CREATOR [All creators ▾]" on the left. On the right: the time with CST or CDT over a short date, the bell, then your avatar, name and role.
2. Hover the date to see the full date. Open the account menu to see your profile, My Account and Sign out as before.
3. Narrow the window to a tablet width. The account button shrinks to the avatar and nothing overlaps.
4. On a phone, the header shows ☰, the page title, the time with its zone, the bell and the avatar on one row.
