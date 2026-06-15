# ADR 0009 — Headless UI for the CitySearch combobox

**Status:** accepted

## Context

City selection is a hand-rolled autocomplete (`CitySearch`): a debounced,
abortable search feeding a custom dropdown, with click-outside handling. Two
problems:

- **Inconsistent shape.** `HomePage` clears the query on pick and shows the
  selection implicitly (the weather card below); `BroadcastPage` swaps the
  search out for a bespoke "selected chip + X" block. Same component, two
  different selected-state UIs.
- **Incomplete a11y.** The input has only an `aria-label`. It's missing the
  ARIA combobox contract (`role="combobox"`, `aria-expanded`,
  `aria-controls`, `aria-activedescendant`, `role="listbox"`/`"option"`) and
  the keyboard contract (arrow keys to move, Enter to select, Escape to
  close). This was the deferred a11y item from Phase 3.3.

## Decision

**Adopt `@headlessui/react`'s `Combobox`** as the basis for a single,
controlled `CitySearch`: the selected city's label shows **inside the input**
with a chevron/clear affordance, the same shape on both pages.

Why Headless UI over the alternatives:

| Option | Fit |
|---|---|
| **Headless UI** *(chosen)* | Unstyled, Tailwind-ecosystem native, full ARIA + keyboard for free, declarative `Combobox*` API, actively maintained by Tailwind Labs |
| Downshift | Also headless + excellent a11y, but a more verbose hooks API; less natural with this Tailwind/component-first codebase |
| Radix | No first-class Combobox primitive — would mean building it from Popover |
| cmdk | Command-palette shape, wrong for an inline field with a selected-value chip |

`CitySearch` becomes **controlled** (`value` / `onChange`). The existing
debounced, abortable search is kept as-is — it just feeds Headless UI's
`ComboboxOptions` instead of a custom dropdown, so the Render-shared-IP
burst protection (ADR-less geocoding fix) is preserved.

## Consequences

- Adds one runtime dependency (`@headlessui/react`).
- The ARIA combobox + keyboard contract comes for free, closing the
  Phase 3.3 a11y item without hand-rolling roles and key handlers.
- The API change (`onSelect` → `value`/`onChange`) ripples into both pages:
  `HomePage` passes its selected city through; `BroadcastPage` **drops its
  bespoke chip+clear block** — the combobox now shows and clears the target
  in-input. One selected-state shape across the app.
- `CitySearch` gains its first tests (it was untested): search-as-you-type,
  select-fires-onChange, the in-input selected label, clear, and recents.
- Headless UI manages open/close and focus, so the manual click-outside
  listener and `open` state are removed.
