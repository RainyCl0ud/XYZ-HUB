# Dashboard: what needs attention

Staging candidate, 23 November 2026. Production is outside this release.

The Dashboard opened with four number cards (Active people, Pending setup, Active creators, Open incidents) that said little about what needed doing. Rainheart asked for it to focus on what needs attention, such as attendance. It now opens with two cards built from data the Hub already has.

## What changes

**Top of the Dashboard**

- **Needs attention.** One row per item, each with its count and a link:
  - **Corrections to review**, "Waiting for your approval". Opens the review tab of the Clock page. It's the same number as the review badge in the sidebar.
  - **Long shifts**, "Clocked in 14 hours or more". These are shifts still open after 14 hours, the same point at which the Clock flags a shift. Opens attendance.
  - **Open QA incidents**, "Across your creators". Opens the incident list.

  A row with nothing waiting shows 0 in grey. A row with items shows its number in white.
- **On the clock now.** Counts for Clocked in, On break and Not clocked in, then up to 5 people (3 on phones):
  - Long shifts come first, then people on a break (longest first), then everyone else.
  - Each row shows the person, their team and the status in words, for example "Meal break · 22 min" or "On shift · 15 h 2 min". It has a "Break" or "Long shift" tag; a long shift's tag has the heavier white border.
  - "View attendance" opens the Clock page. The card refreshes every minute while the page is open.
- The number cards are removed.
- The intro now reads "What needs attention across your people, attendance and quality."

**Layout:** the two cards sit side by side when each can be at least 400px wide (for example at 1280px and 1440px). On smaller screens, such as 1024px and phones, they stack, as the panels below them already do.

**Below:** Open QA incidents, then Current creators and Recently added people side by side, then Coming later. Schedule, Revenue and Commission sheets still say "coming later" (brief section 9).

**Lateness isn't shown.** "Not clocked in" counts everyone in scope who hasn't clocked in. The schedule is not in this build, so the Hub can't tell who is late (brief section 9).

## Who sees what

Each card and row follows existing permissions. No permission is added or removed.

| Account | Needs attention | On the clock now |
| --- | --- | --- |
| Owner | All three rows | The whole agency; opens `/clock` |
| Manager (team attendance, assigned reviews) | Corrections, long shifts, incidents | Their assigned team; opens `/clock?tab=team` |
| QC (QA only) | Open QA incidents | Hidden unless they have an attendance grant |
| Chatter | Hidden | Hidden; the Your account card stays |

- **Corrections to review:** needs a correction review permission (assigned, ops or all). It's the same rule as the sidebar badge.
- **Long shifts and On the clock now:** need an attendance overview permission (agency, team or chatters). They follow the same scope as the Clock page's Team view.
- **Clock turned off:** with the Staging Clock flag off, neither card shows anything from the Clock.
- **No Clock page access:** an account with attendance but no access to the Clock page sees the cards without links.

## Technical notes

- **Backend:** the attendance overview (`/api/clock/overview`, and the Owner endpoint) now also returns `counts.longShifts`. It counts shifts in the viewer's existing scope that have been open 14 hours or more, across the whole roster rather than only the first page. This is one extra count query in the same transaction. There is no migration, setting or flag change. If the frontend deploys before the backend, the Long shifts row stays hidden until the count arrives.
- **Frontend:** corrections reuse the existing review-count provider. Attendance uses the scoped overview; a 403 or 404 hides the card. The old number-card styles are removed.

## Verification (local)

- All 31 frontend suites, lint, the frontend build, and type checks with TypeScript 6.0.3 (as Railway builds) and 5.9.3 for frontend and backend.
- **New `test:dashboard-attention`** renders the Dashboard for fictional Owner, Manager, QC, Chatter and attendance-only accounts, with the Clock on and off, and checks:
  - which cards and rows each account sees, and where each link goes
  - that no "!" marker appears
  - the card order
  - the row ordering and wording
  - that the corrections row uses the sidebar badge's permission list
  - the 11px minimum and the monochrome tokens
- **`test:dashboard-phone`** is updated for the removed number cards.
- **Backend:** `test:clock-overview-ladder` now checks long shifts per viewer:
  - A 15-hour shift counts and a 13-hour shift doesn't.
  - A long shift on another creator stays hidden from a manager.
  - The Owner endpoint returns the same count.

  The other clock suites (`test:clock`, `test:clock-live`, `test:clock-alerts`, `test:clock-corrections`) also passed, against an isolated loopback database with fictional data.
- **Checked signed in, on a local copy.** The local frontend and API ran against an isolated loopback database with a fictional Owner. The data included 5 people clocked in (one 15 hours in, two on breaks), 1 not clocked in, 2 pending corrections and 7 open incidents.
  - The counts matched the API: 2 corrections (the same as the sidebar badge), 1 long shift, 7 incidents, and 5 / 2 / 1 on the clock.
  - Corrections to review opened the review tab, which listed both requests.
  - Checked at 320px, 375px, 1024px, 1280px and 1440px with no horizontal scroll. Count labels sit on one line, except "Not clocked in" at 320px (two lines).
  - Phones list 3 people on the clock. The keyboard focus outline on the rows is 2px white with a 2px gap.

  Staging itself was not checked signed in.

## Staging acceptance

1. Sign in as the Owner and open the Dashboard. At the top you should see Needs attention (Corrections to review, Long shifts, Open QA incidents) and On the clock now. The four number cards are gone.
2. Corrections to review matches the review badge in the sidebar. Tap it and the review tab of the Clock page opens.
3. On the clock now matches the Clock page's counts. People on a break show the break and how long it has lasted. View attendance opens the Clock page.
4. Below, Open QA incidents is followed by Current creators and Recently added people, then Coming later.
5. On a phone, the cards stack in the same order, with 3 people on the clock.
6. Sign in as a chatter. The Dashboard shows the Your account card and no attention cards.
