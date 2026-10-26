# Clock corrections and approvals

## Scope and workflow

Staging extension of the existing Clock & Hours feature, using its existing feature flags. One personal shift still covers all creator assignments. This release does not calculate pay, publish to Production, send email or push notifications, or introduce an external service.

Staff can request changes to their recorded clock-in, clock-out and paid-break times, or request a missed, completed shift. A reason is required. Submitting a request leaves recorded hours unchanged. Staff can cancel their own pending request; approval or rejection requires another authorized reviewer and a note. A correction closes a forgotten open shift only when approved.

The review screen shows recorded and requested times, paid breaks, reason, status and the review note. All displayed/input times use America/Chicago with seconds, CDT/CST automatically. A repeated fall-back hour requires an explicit occurrence; nonexistent spring-forward times are rejected. Worked hours use elapsed time. Approval recalculates the Central start-day and Monday start-week attribution, and invalidates previously loaded personal history pages.

## Approved routing

Confirmed by Rainheart on October 26, 2026:

| Requester's current role/assignment | Reviewer |
| --- | --- |
| Chatter, Trial or QC with active creator assignments | A Manager currently assigned to at least one of those creators, or Owner |
| Manager, Accountant, General Staff, or staff without an active creator assignment | Ops or Owner |
| Ops | Owner |

Owners oversee all eligible requests but cannot approve or reject their own. Owner/Developer/Creator historical or mixed-role requests also require another Owner. Developer and Creator roles gain no default request/review permissions. Routing uses current memberships and active assignments on every read/decision; role rank or broad data scope alone does not grant correction authority.

Explicit permissions: `clock.corrections.request`, `.assigned`, `.ops`, `.all`, with Clock access and self-view dependencies. Default grants are installed once under `clock-corrections-v1`. Repeated pre-deploy provisioning preserves later administrator changes.

## Record protection

- The server captures an immutable before snapshot and requested after snapshot. Names and review metadata remain if an account is deleted; hours cannot be approved for a deleted subject.
- Existing breaks cannot disappear from a proposal. An accidental break can be corrected to zero duration, retaining its original history. All breaks remain paid. Reviewed corrections may change historical break duration; the live clock's automatic break limits remain unchanged.
- Reject future, reversed, outside-shift and overlapping break times; reject overlaps with another recorded shift. A missing shift becomes a real closed shift only on approval.
- A version digest detects clock-out, break, worker or later correction changes. A stale request cannot overwrite a newer record; cancel and resubmit.
- Stable person/request locks serialize decisions and ordinary clock writes. Repeated submissions/decisions are safe to retry. One recorded shift has at most one pending correction.
- Approval, resulting shift/break changes and the audit event are atomic. Audit failure rolls the whole decision back. Rejection/cancellation changes no recorded hours.
- Private paginated queues use authorized cursors; unrelated direct IDs are hidden. No self approval, including Owner oversight.

## Deployment

Additive migration `20261026000000_clock_corrections` follows the 21 previous migrations. It adds correction records, constraints/indices and the CORRECTION break end reason; migration alone rewrites no shift/break records. The normal guarded staging pre-deploy installs the permission defaults.

Keep the existing Railway settings unchanged:

- Build: `npm run build:backend`
- Pre-deploy: `npm run chat:prepare-staging --workspace=backend`
- Start: `npm run start --workspace=backend`
- Existing Backend/Frontend Clock and Chat flags and Staging Postgres reference remain as configured.

Wait for Backend's migration/pre-deploy and deployment to succeed before testing the new screens. Do not promote to main/Production as part of this release. A rollback of app code does not undo approved corrections; use a new reviewed correction rather than deleting history or reverting the database.

## Verification

On an isolated loopback PostgreSQL database with synthetic accounts:

- 18 correction groups: routing and role changes; no self approval; permission/assignment revocation; retries/concurrent decisions; missing/open shifts; stale records; break/time validation; overlap; audit rollback; retained deleted-account history; HTTP authentication/no-store; private pagination; feature flag; Central gap/fold; day/week and history revision.
- A fresh 21-to-22 migration rehearsal ran the actual guarded staging pre-deploy. It preserved accounts, sessions, permissions/assignments, creator/QA/strike/chat data, shifts, breaks, attendance alerts/read state and the existing audit entry. No reset was used.
- The separate guarded disposable-staging reset accounts for correction foreign keys; its schema-aware regression runs without a database and passed. No real reset was run.
- Existing Clock (18), attendance alerts (15), ordinary Chat (22), protected Chat (18), Role Builder (19) and audit presentation (6) groups passed.
- Browser: normal password/2FA sign-in with fake local accounts; native date edit and request submission; hours unchanged while pending; assigned Manager approval; staff total 2:00 to 2:15 with paid break unchanged; retained before/after and note; requester cancellation with hours unchanged. No console errors/warnings observed.
- Dialogs inspected at 390px and 320px, with no document/dialog horizontal overflow; agency monochrome and visible focus retained.

Production deployment and real staging acceptance are separate from these local checks. Manager hours/export, device push and the rest of Block 2 remain outside this change.
