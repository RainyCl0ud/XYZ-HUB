# XYZ design reference

User instruction, 23 October 2026: follow the agency's styling consistently. Dim requires adherence to the supplied XYZ Web Style Guide. The original end-of-session review was notes only; Rainheart subsequently authorized the Clock and Chat-brand correction batch.

## Authoritative sources reviewed

- `C:/Users/Admin/Desktop/XYZ MEI'S FILES/XYZ Web Kit/XYZ Web Style Guide.pdf` — all eight pages read and visually reviewed; version 1.0, September 2026, owner Dim.
- Companion `xyz-tokens.css` in the same folder: exact token definitions and base components.
- Existing `frontend/src/WebKitFoundation.css` already adapts many agency tokens to the Hub's variable names. Extend the established foundation instead of introducing a separate theme. The supplied kit may be mapped into an existing theme provided its values remain identical.

## Rules for subsequent UI work

- Monochrome only, including errors, warnings, success, links, charts, selection and focus. No gold accents, coloured role badges, coloured toasts or browser-default blue/red/green controls.
- Page background black; white text; no light mode. White logo on black, preserve proportions and clear space, no recolouring, stretching or effects. Use supplied white SVG and favicon assets. Logo minimum height 16px, header reference approximately 20px; identifying alt text `XYZ MGMT`.
- Surfaces: `#000000`, `#0D0D0D`, `#141414`, `#1A1A1A`.
- Text: `#FFFFFF` body/headings; `#CCCCCC` secondary; `#999999` helper text; `#8E8E8E` faintest readable labels/timestamps; `#5C5C5C` disabled controls only.
- Rules: `#333333` separators; `#666666` control/card borders; `#FFFFFF` emphasis and focus. Refer to the companion CSS tokens rather than introducing near-match greys.
- Helvetica Neue, Helvetica, Arial, Segoe UI, sans-serif. No hosted font. Type scale: 44px page title, 32px stat numbers, 24px section heading, 18px card/dialog titles, 15px body/inputs, 13px tables/helpers/buttons. 11px reserved for uppercase, bold, letter-spaced labels. Headings weight 800; large headings slightly negative tracking. Body line height 1.5. Use tabular figures for table numbers/IDs/timestamps.
- Spacing: 4, 8, 12, 16, 24, 32, 48, 64px. Corners 2px; no pills or additional rounding. Use borders and space rather than shadows. Content maximum width 1200px.
- Primary action white with black text, one per form or screen. Secondary actions grey outlined, white text. Errors use a 2px white border and bold text, with no leading `!` or other marker (owner decision, 22 November 2026); status words must always be visible. Destructive actions use heavy white borders, with named-person confirmation where applicable.
- Dialogs: dark panel, white border. Toasts: white with black text. Tables: horizontal separators only, numbers right-aligned. Manager-only pages retain their restriction banner; menu visibility never replaces server-side authorization.
- Header: white mark top-left, small uppercase product label, signed-in person on right. Every page retains the confidentiality footer and its white rule.
- Phone layout: stack columns; wide tables scroll inside their container, never the page. Responsive navigation can change arrangement without inventing a new visual style.
- Accessible labels, linked field errors, visible 2px white keyboard outline with 2px gap, reduced motion, text contrast at least 4.5:1 and identifying borders at least 3:1. State must not rely on colour or position alone.
- Before a screen ships: inspect colour values against approved tokens, compare a screenshot in greyscale, tab through controls and check the footer. These are design checks, not authorization to deploy Production.

## Chat alignment in the current staging batch

PR #61's Chat usability improvements are on staging, but its Chat CSS introduced gold/beige accents, non-token greys, rounded panels/avatars and shadows. Its font sizes and unconstrained desktop content width also require reconciliation with this guide. These are known design deviations, not approved brand exceptions.

The current Clock/brand batch corrects Chat against the agency tokens while preserving the creator selector, search, private/channel filters, mobile Browse navigation and existing access rules. The member/settings/empty/error/read-only states are included. New Clock styling uses the same approved palette and geometry. Desktop/phone views were verified locally before preparing the staging merge. Production remains outside the release scope.

The original guide-review turn changed notes only. The subsequent Clock/brand implementation is a separate staging-only batch; full-site brand compliance has not been claimed.
