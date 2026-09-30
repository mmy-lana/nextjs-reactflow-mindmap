"use client";

import { useEffect, useRef, type MouseEvent as ReactMouseEvent, type RefObject } from "react";
import { getFocusableElements } from "@/lib/focusable";

export interface UseOverlayA11yOptions {
  /**
   * Element focused when the overlay opens. Defaults to the first focusable
   * descendant so screen readers announce the dialog instead of the page
   * behind it.
   */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Selector of a descendant that should receive focus instead. */
  initialFocusSelector?: string;
  /** Whether the backdrop dismisses the overlay. Defaults to `true`. */
  closeOnBackdrop?: boolean;
}

/**
 * Shared accessibility behaviour for the layered surfaces (`Modal`, `Drawer`).
 *
 * It bundles the four rules an overlay has to honour to be usable with a
 * keyboard or a screen reader:
 *
 * 1. Tab cycles inside the overlay instead of escaping to the canvas.
 * 2. Escape closes it.
 * 3. The page behind cannot scroll while it is open, which otherwise reveals
 *    the body under a fixed overlay on iOS.
 * 4. Focus returns to the trigger once it closes.
 *
 * @param isOpen Whether the overlay is currently mounted and visible.
 * @param containerRef Ref to the element that holds the focusable content.
 * @param onClose Invoked on `Escape` and on backdrop activation.
 */
export function useOverlayA11y(
  isOpen: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  options: UseOverlayA11yOptions = {},
): void {
  const { initialFocusRef, initialFocusSelector, closeOnBackdrop = true } = options;
  // Keep the latest callback without re-running the effect on every render of
  // the parent, which would steal focus back while the user interacts.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const initialFocusRefRef = useRef(initialFocusRef);
  initialFocusRefRef.current = initialFocusRef;
  const initialFocusSelectorRef = useRef(initialFocusSelector);
  initialFocusSelectorRef.current = initialFocusSelector;
  const closeOnBackdropRef = useRef(closeOnBackdrop);
  closeOnBackdropRef.current = closeOnBackdrop;

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // 1. Move focus into the overlay.
    const selector = initialFocusSelectorRef.current;
    const preferred =
      initialFocusRefRef.current?.current ??
      (selector ? container.querySelector<HTMLElement>(selector) : null) ??
      getFocusableElements(container)[0] ??
      container;
    preferred.focus({ preventScroll: true });

    // 2/3. Keyboard handling plus a hard scroll lock on the document body.
    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = getFocusableElements(container);
      if (focusable.length === 0) {
        // Nothing to tab to: keep the focus pinned on the dialog itself.
        event.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !container.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
      // 4. Hand focus back to whatever opened the overlay.
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [isOpen, containerRef]);
}

/** True when a pointer event landed on the backdrop rather than the panel. */
export function isBackdropActivation(
  event: ReactMouseEvent<HTMLElement>,
  panel: HTMLElement | null,
): boolean {
  if (!panel) {
    return false;
  }
  return !panel.contains(event.target as Node);
}
