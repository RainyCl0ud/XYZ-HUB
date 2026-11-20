# Site action confirmations

Staging candidate, 20 November 2026.

Transient action confirmations use the shared ToastProvider across the Hub. The existing management pages already use it for people, creators/models, roles and rank/scope changes, QA incidents/rules, strikes/reasons, configuration and Clock/Hours corrections. This update closes the remaining action-feedback gaps in Chat, account profile-picture changes, browser-notification preferences, invitation completion and password recovery/reset.

Chat channel creation/rename, role/member grants, archiving, cleanup, message edits/deletions, pin changes, quarantine changes and explicit mark-read actions use global toast confirmations. The old Chat and nested-tool confirmation banners are removed, so deleting a message produces one confirmation. Announcement publication produces a toast while its durable published receipt/email status remains available. Ordinary message sends, reactions, polling and automatic read tracking do not generate success-toast traffic; their results are shown directly in the conversation.

Form validation, loading, reconnect/access guidance, edit conflicts, read state and durable history/status are contextual UI, not transient action confirmations. They remain beside the relevant controls. Auth completion screens retain their next-step navigation without duplicate green success banners. No data, permission or API behavior is changed.

The shared viewport uses a manual native popover for top-layer placement and portals into the active native modal to remain interactive. Existing timing, queue limit, dismiss buttons and live-region semantics are retained. Notifications remain visible after dialog close or route changes, and do not move focus from the form. Browsers without popover support use the existing positioned viewport.

## Verification

The existing 23 frontend regression suites cover Chat compatibility/layout, permissions, reactions, replies, search, announcements, browser-notification helpers and Clock workflows. SSR message fixtures now include the actual ToastProvider. Old source checks for the removed inline notice and prior picker/grant-label versions were updated to check the current supported controls.

The new local browser fixture exercises actual channel-name and permission-save handlers (one success toast, no old banner), rejected saves and successful retry, native/nested modal layering and dismissal, route persistence, focus retention, timeout, the five-toast bound and mobile placement. It also exercises the actual account avatar save/removal pages and password recovery/reset/invitation completion flows with intercepted fictional API responses. It makes no shared-staging mutations or email deliveries.

To run that browser regression, start the frontend Vite development server on loopback port 4198 with VITE_API_URL pointing to loopback port 4199. Run `node scripts/test-site-action-toasts.mjs` from frontend with Playwright resolvable, or set PLAYWRIGHT_MODULE to the installed module's location. HUB_TEST_ORIGIN and HUB_TEST_OUTPUT may override the loopback URL and screenshot output. The fixture is outside src and is not included in the production bundle.

Build and frontend lint are required. Local checks prepare the release; signed-in shared-staging acceptance is a separate step after deployment. Production is outside this release.
