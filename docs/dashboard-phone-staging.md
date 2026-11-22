# Dashboard on phones

Staging candidate, 22 November 2026. Production is outside this release.

On a phone, the Dashboard took about two screens of scrolling, and the first screen showed little more than the intro and four tall number cards. Most of its text was 8–10px, below the Hub's 11px minimum. It's now compact and readable.

## What changes

**Phones (720px and below)**

- **Number cards:** each is one slim line, for example "7 Active people ›", in a 2×2 grid. They're 44px tall instead of 104px. The tiny caption is hidden. Every card still opens the same filtered list. The number used to be centred while its label sat on the left; both now line up.
- **Intro:** "AGENCY OVERVIEW / Dashboard" stays. The description sentence is hidden, since the header already names the page.
- **Card headers:** the title and its link ("View people ›", "View creators ›", "View incidents ›") share one line. The description under each title is hidden.
- **Recently added people:** name and role on the left, status and date on the right, so the status no longer wraps under the name. Phones show the 3 newest people; desktop still shows 5.
- **Current creators:** "2 incidents" reads on one line on the right.
- **Open QA incidents:** each incident is two lines: the person and creator, then the rule, with the severity on the right. The repeated "Violation" and "Open incident" labels are hidden. When there are none, "No open QA incidents" is one line (about 48px) instead of a 230px box.
- **Coming later:** one line per item, for example "SCHEDULE … Coming later". Schedule, Revenue and Commission sheets all still say "coming later" (brief section 9).

**Every width**

- The Dashboard's 8–10px text is raised to the web kit scale. Names and helper text are 13px; labels are 11px uppercase (card labels, status tags, "Violation", the Coming later and Your account labels). The desktop layout is otherwise unchanged.
- "1 incident" instead of "1 incidents".

**Unchanged:** the order of the cards, the header and creator picker, the confidentiality footer, who sees what, and where every link goes. Frontend only: no backend change, migration, flag or setting.

## Verification (local)

- All 30 frontend suites. The new `test:dashboard-phone` checks the 11px minimum, the slim cards and their links, the one-line headers and rows, the compact empty state, and the three "coming later" items.
- Lint, the frontend build, and type checks with TypeScript 6.0.3 (as Railway builds) and 5.9.3.
- **Checked signed in, on a local copy.** The local frontend and API ran against an isolated loopback database with a fictional Owner, 10 fictional people, 4 creators and 7 open incidents.
  - At 375px the page went from 2,825px to 1,506px tall (about 47% shorter), and the first card starts at 317px instead of 492px.
  - Checked at 320px, 375px, 1024px and 1440px: no horizontal scroll, and long names and rules are shortened with an ellipsis.
  - Also checked: the one-line empty state (a creator with no incidents) and the keyboard focus outline on the cards (2px white with a 2px gap).

  Staging itself was not checked signed in.

## Staging acceptance

1. On a phone, open the Dashboard. Under the title you should see four slim cards in two rows, each a number, a label and ›. Tap one and the matching list opens.
2. Each card's title and its View link share one line. Recently added people shows 3 people, each with the status and date on the right.
3. Pick a creator with no open incidents. "No open QA incidents" is a single line.
4. Coming later lists Schedule, Revenue and Commission sheets, one per line.
5. On a desktop, the layout is as before, with larger, readable text.
