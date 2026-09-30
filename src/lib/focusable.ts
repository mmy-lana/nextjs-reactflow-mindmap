/**
 * Shared focus management helpers for the overlay and menu components.
 *
 * They live outside the component tree because both `Modal`/`Drawer` (via
 * `useOverlayA11y`) and `Dropdown` need the same notion of "what can receive
 * focus", and the answer has to stay identical across the two.
 */

/** Selector matching every natively focusable element. */
export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/** Selector for the menu rows rendered by `Dropdown`. */
export const FOCUSABLE_ITEM_SELECTOR = '[role="menuitem"]:not([disabled])';

/**
 * Returns the focusable descendants of a container in tab order.
 *
 * Elements hidden by CSS are filtered out so the focus cycle never lands on an
 * invisible row (an offscreen or collapsed panel still matches the selector).
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.offsetParent !== null || element.getClientRects().length > 0,
  );
}
