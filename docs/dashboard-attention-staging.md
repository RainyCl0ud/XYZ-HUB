# Dashboard: what needs attention

Staging candidate, 23 November 2026. Production is outside this release.

The Dashboard opened with four number cards (Active people, Pending setup, Active creators, Open incidents) that said little about what needed doing. Rainheart asked for it to focus on what needs attention, such as attendance. It now opens with two cards built from data the Hub already has.

## What changes

**Top of the Dashboard**

- **Needs attention.** One row per item, each with its count and a link:
  - **Corrections to review**, "Waiting for your approval". Opens the review tab of the Clock page. It's the same number as the review badge in the sidebar.
  - **Long shifts**, "Clocked in 14 hours or more". These are shifts still open after 14 hours, the same point at which the Clock flags a shift. Opens attendance.
  - **Open QA incidents**, "Across your creators". Opens the incident list.

  A row with items shows its number in white; 0 shows in grey. A count that hasn't loaded, or couldn't load, shows "—", never a reassuring 0. Screen readers hear "Not loaded".
- **On the clock now.** Counts for Clocked in, On break and Not clocked in, then up to 5 people (3 on phones):
  - Long shifts come first, then people on a break (longest first), then everyone else.
  - Long shifts and breaks are listed even on a busy roster where they fall past the first page of the Clock page's list.
  - Each row shows the person, their team and the status in words, for example "Meal break · 22 min" or "On shift · 15 h 2 min".
  - Long shifts and breaks also get a "Long shift" or "Break" tag. A long shift's tag has the heavier white border. People simply on shift have no tag.
  - "View attendance" opens the Clock page; the people rows themselves aren't links.
  - The card refreshes every minute while the page is open. If a refresh fails, the card keeps the last counts and says so: "Couldn't refresh. Showing attendance from 1:14 PM CST." It also offers Retry. A failed first load says "Attendance couldn't load." with Retry.
- The number cards are removed.
- The intro now reads "What needs attention across your people, attendance and quality."

**Layout:** the two cards sit side by side when each can be at least 400px wide (for example at 1280px and 1440px). On smaller screens, such as 1024px and phones, they stack, as the panels below them already do.

**Below:** Open QA incidents, then Current creators and Recently added people side by side, then Coming later. Schedule, Revenue and Commission sheets still say "coming later" (brief section 9).

**Lateness isn't shown.** "Not clocked in" counts everyone in scope who hasn't clocked in. The schedule is not in this build, so the Hub can't tell who is late (brief section 9).

**Known limits, unchanged:**

- The Clock page's own list of active shifts is still newest first, 20 per page. On a busy roster, a long shift shown on the Dashboard can be on a later page there.
- Corrections to review uses the same count as the sidebar badge. That count drops to 0 while the API can't be reached, so during an outage the row shows 0, just as the badge does.

## Who sees what

Each card and row follows existing permissions. No permission is added or removed. The table uses the default role grants.

| Account | Needs attention | On the clock now |
| --- | --- | --- |
| Owner | All three rows | The whole agency; opens `/clock` |
| Ops Manager | Corrections, long shifts (and incidents with QA access) | The whole agency; opens `/clock?tab=team` |
| Manager | Corrections, long shifts, incidents | Their assigned team; opens `/clock?tab=team` |
| QC | Long shifts, incidents | The chatters on their creators; opens `/clock?tab=team` |
| Chatter | Hidden | Hidden; the Your account card stays |

- **Corrections to review:** needs a correction review permission (assigned, ops or all). It's the same rule as the sidebar badge.
- **Long shifts and On the clock now:** need an attendance overview permission (agency, team or chatters). They follow the same scope as the Clock page's Team view. An account with QA access but no attendance grant sees only Open QA incidents.
- **Clock turned off:** with the Staging Clock flag off, neither card shows anything from the Clock.
- **No Clock page access:** an account with attendance but no access to the Clock page sees the cards without links.
- **Access changes:** attendance is kept per account. After a different sign-in, role or creator assignment, the old snapshot is not shown and a fresh one loads.

## Technical notes

- **Backend:** the attendance overview (`/api/clock/overview`, and the Owner endpoint) now also returns two things, both in the viewer's existing scope:
  - `counts.longShifts`: shifts open 14 hours or more, counted across the whole roster.
  - `attentionShifts` (first page only): up to 5 long shifts (oldest first) and up to 5 shifts on a break (longest first), wherever they fall in the roster.

  These are three small extra queries in the same transaction. There is no migration, setting or flag change. If the frontend deploys before the backend, the Long shifts row stays hidden and the list uses the first page until the new fields arrive.
- **Frontend:**
  - The cards are in `components/DashboardAttention.tsx`. The row and failure rules are in `lib/dashboard-attention.ts`.
  - Corrections reuse the existing review-count provider.
  - A 403 or 404 hides the attendance card.
  - The old number-card styles are removed.

## Verification (local)

- All 31 frontend suites, lint, the frontend build, and type checks with TypeScript 6.0.3 (as Railway builds) and 5.9.3 for frontend and backend.
- **New `test:dashboard-attention`:**
  - Renders the Dashboard for fictional Owner, Manager, default QC, QA-only, Chatter and attendance-only accounts, with the Clock on and off, and checks who sees which card and row and where each link goes.
  - Renders the loaded attendance card from fixture data: the counts, the 5 people in attention order (including long shifts past the first page), the tags, no links per person, and the out-of-date and error notices.
  - Renders the Needs attention rows: emphasis only above 0, "—" and "Not loaded" for missing counts.
  - Checks the rules directly: a 403 or 404 hides the card, other failures mark the data out of date, and an older backend hides the Long shifts row.
  - Checks styles: 11px only for uppercase bold spaced labels, 13px otherwise, and approved monochrome tokens only.
- **`test:dashboard-phone`** is updated for the removed number cards.
- **Backend:** `test:clock-overview-ladder` now checks, per viewer scope:
  - A 15-hour shift counts as a long shift and a 13-hour shift doesn't.
  - With 20 newer shifts filling the first page, the two long shifts and an open break are still returned (oldest first, scoped per manager), and later pages don't repeat them.
  - The Owner endpoint returns the same count.

  The other clock suites (`test:clock`, `test:clock-live`, `test:clock-alerts`, `test:clock-corrections`) also passed, against an isolated loopback database with fictional data.
- **Checked signed in, on a local copy.** The local frontend and API ran against an isolated loopback database with a fictional Owner. The data included 5 people clocked in (one 15 hours in, two on breaks), 1 not clocked in, 2 pending corrections and 7 open incidents.
  - The counts matched the API: 2 corrections (the same as the sidebar badge), 1 long shift, 7 incidents, and 5 / 2 / 1 on the clock.
  - Corrections to review opened the review tab, which listed both requests.
  - Checked at 320px, 375px, 1024px, 1280px and 1440px with no horizontal scroll. Count labels sit on one line, except "Not clocked in" at 320px (two lines).
  - Phones list 3 people on the clock. The keyboard focus outline on the rows is 2px white with a 2px gap.
  - With the local API stopped, a refresh kept the last counts and showed "Couldn't refresh. Showing attendance from …" with Retry. This was checked on desktop and on a phone.

  Staging itself was not checked signed in.

## Staging acceptance

1. Sign in as the Owner and open the Dashboard. At the top you should see Needs attention (Corrections to review, Long shifts, Open QA incidents) and On the clock now. The four number cards are gone.
2. Corrections to review matches the review badge in the sidebar. Tap it and the review tab of the Clock page opens.
3. On the clock now matches the Clock page's counts. People on a break show the break and how long it has lasted. View attendance opens the Clock page.
4. Below, Open QA incidents is followed by Current creators and Recently added people, then Coming later.
5. On a phone, the cards stack in the same order, with 3 people on the clock.
6. Sign in as a chatter. The Dashboard shows the Your account card and no attention cards.
