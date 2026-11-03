# Contech UI direction

## Character

Calm, technical, and trustworthy. The interface should feel like a well-kept
site register: precise enough for document control, but never visually dense.

## Foundations

- **Canvas:** cool off-white surfaces with navy text for long working sessions.
- **Navigation and entry:** deep navy with restrained cyan accents signals the
  controlled, secure parts of the product.
- **Actions:** one clear primary action per area; neutral controls for secondary
  work; red remains reserved for destructive actions.
- **Typography:** compact uppercase labels establish hierarchy; headings are
  strong and concise; operational copy is plain and direct.
- **Surfaces:** use modest borders, soft elevation, and 9–18px radii to group
  related work without excessive cards.

## System implementation

- `src/main.css` owns the shared `--ui-*` tokens for typography, canvas,
  ink, borders, actions, feedback, and document-type accents. Role-specific
  `--admin-*` and `--contech-*` names are compatibility aliases, not parallel
  palettes.
- Use document-type accents only to distinguish IR, CPR, TR, revisions, and
  Shop Drawings. They appear as compact badges or a modest top rule, never as
  heavy side rails or a second primary brand color.
- Use navy for controlled primary actions and protected modal headings; cyan
  remains a restrained supporting accent. Reserve red for destructive actions.
- Use the shared system font stack for product UI. Exported SVG charts may use
  their embedded fallback font for dependable document portability.

## Color roles

- **Information and selection:** blue/cyan; use for active navigation, reports,
  search context, and Shop Drawing wayfinding.
- **Progress and completion:** green, always paired with a completion label or
  icon.
- **Attention required:** amber, always paired with pending or review copy.
- **Errors and deletion:** red only, always paired with explicit error or
  destructive-action language.
- **Exports:** report charts use the same high-contrast operational palette;
  category labels remain present so color is never the sole identifier.
- **Shop Drawing:** use cyan for local selection and wayfinding, and the shared
  blue primary action for submission. Avoid violet and decorative gradients.

## Reusable control tokens

- Use `--ui-control-border` and `--ui-control-focus-ring` for editable fields
  across Admin, DC, Engineer, and records workspaces. A field must not invent a
  second focus treatment.
- Use `--ui-surface-subtle` for quiet grouped content and `--ui-text-secondary`
  for supporting data text. Use `--ui-muted` for placeholders and other
  intentionally de-emphasized copy.
- Reference Drawing chips use the Shop Drawing information role; revision
  controls use the neutral revision role. Neither uses a standalone purple.

## Interaction rules

- Inputs show a visible keyboard-focus ring and meaningful inline errors.
- Loading and disabled states must still communicate what is happening.
- Respect reduced-motion preferences.
- Responsive layouts should preserve the primary task first and avoid forcing
  horizontal scrolling except for tabular records.

## Responsive operating rules

- Phone layouts reflow forms and page controls into a single task column. Keep
  record tables as horizontal scrollers with a readable minimum table width;
  do not compress operational columns into illegible cells.
- Mobile navigation strips and header actions have 44px touch targets. The
  Admin header shortens the DC route label only on narrow screens while its
  accessible name remains explicit.
- Support notched screens with `viewport-fit=cover` and safe-area padding for
  the mobile drawer and narrow Admin header.

## Account access

The Welcome page is sign-in only. Account provisioning belongs to
**Admin Mode → User Management**, where role selection and permissions can be
reviewed before saving.
