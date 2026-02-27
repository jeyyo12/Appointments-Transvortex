# UI Guidelines (SaaS Premium)

## Visual system rules
- Preserve existing SaaS premium look.
- No full-page/full-panel green backgrounds.
- Use existing design tokens/components; avoid introducing new visual systems.
- Keep spacing, elevation, and typography consistent with current app shell.

## Layout and responsiveness
- Layout lock (mobile): widths `100–600` should keep a stable `~400px` structure; only scale values.
- Header lock: widths `1023–1400` keep same structural layout as `1023`.
- Avoid adding breakpoint-specific structural rewrites unless required to fix a bug.

## Action buttons behavior
Strict conditional UI:
- Show button only if it can act with current data.
- Hide non-functional actions.

Required behavior:
- `Call`: only if phone exists and is valid.
- `Navigate/Visit`: only if address/postcode exists and maps URL can be formed.
- `Mark Paid/Unpaid`: only if payment handler and target record are available.
- `Invoice`: only if invoice open/create flow can resolve linkage.

## Appointments cards rules
- Always prioritize clear visibility for core actions.
- Avoid burying critical payment actions behind non-obvious states.
- Vehicle, client, date/time, and payment info should degrade gracefully to placeholders.

## Mobile constraints (iPhone/Android)
- Respect safe-area insets for bottom nav, FAB, and fixed bars.
- Tap targets: minimum ~44px height for primary interactive controls.
- Avoid overflow clipping in action rows.
- Keep scroll performance smooth (avoid heavy reflow and large JS layout thrash).

## Print/performance guardrails
- Invoice print layout is frozen; do not alter print structure.
- Optimize only data mapping/render timing when fixing invoice issues.
- Never add heavy UI effects that degrade mobile rendering or print output.

## Accessibility baseline
- Keep `aria-label`/button semantics for icon-only actions.
- Preserve keyboard access where currently present.
- Ensure hidden states are semantic (not visually shown but non-functional).