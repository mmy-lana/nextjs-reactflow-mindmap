"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";
import { IconButton } from "./IconButton";
import { FOCUSABLE_ITEM_SELECTOR } from "@/lib/focusable";

export interface DropdownMenuItem {
  /** Stable value handed back through `onSelect`. */
  value: string;
  label: string;
  icon?: ReactNode;
  /** Shortcut hint rendered on the right, e.g. `⌘Z`. */
  shortcut?: string;
  /** Renders the row in the danger color. */
  isDanger?: boolean;
  disabled?: boolean;
}

export interface DropdownProps {
  /** Accessible name of the trigger. */
  label: string;
  items: readonly DropdownMenuItem[];
  onSelect: (value: string) => void;
  /** Trigger content. Defaults to a vertical ellipsis icon. */
  trigger?: ReactNode;
  triggerVariant?: "solid" | "surface" | "ghost" | "danger";
  /**
   * Which side of the trigger the menu opens on.
   *
   * `top` is the toolbar default; a trigger near the top of a page wants
   * `bottom` so the menu does not open off screen.
   */
  placement?: "top" | "bottom";
  /** Controlled alignment of the menu relative to the trigger. */
  align?: "start" | "end";
  className?: string;
  children?: never;
}

/**
 * Keyboard accessible menu popover.
 *
 * The menu is a plain absolutely positioned list rather than a floating
 * element: it is always anchored to a toolbar button that is already inside
 * the viewport, so a full positioning engine would add weight without
 * changing the result. Arrow keys move the highlight, `Enter`/`Space` commit,
 * `Escape` closes and returns focus to the trigger.
 */
export function Dropdown({
  label,
  items,
  onSelect,
  trigger,
  triggerVariant = "surface",
  placement = "top",
  align = "end",
  className,
}: DropdownProps) {
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const enabledIndexes = items
    .map((item, index) => (item.disabled === true ? -1 : index))
    .filter((index) => index >= 0);

  const close = useCallback((restoreFocus = true) => {
    setIsOpen(false);
    if (restoreFocus) {
      triggerRef.current?.focus();
    }
  }, []);

  const select = useCallback(
    (value: string) => {
      close();
      onSelect(value);
    },
    [close, onSelect],
  );

  // Dismiss on an outside pointer press. `pointerdown` fires before the click
  // that would otherwise reach the trigger a second time.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handlePointerDown = (event: PointerEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) {
        close(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen, close]);

  const focusItem = useCallback(
    (index: number) => {
      setActiveIndex(index);
      const menu = containerRef.current;
      if (!menu) {
        return;
      }
      const option = menu.querySelectorAll<HTMLElement>(FOCUSABLE_ITEM_SELECTOR)[index];
      option?.focus();
    },
    [],
  );

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (enabledIndexes.length === 0) {
      return;
    }
    const currentPosition = enabledIndexes.indexOf(activeIndex);
    const previous = enabledIndexes[(currentPosition - 1 + enabledIndexes.length) % enabledIndexes.length];
    const next = enabledIndexes[(currentPosition + 1) % enabledIndexes.length];

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusItem(next);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusItem(previous);
        break;
      case "Home":
        event.preventDefault();
        focusItem(enabledIndexes[0]);
        break;
      case "End":
        event.preventDefault();
        focusItem(enabledIndexes[enabledIndexes.length - 1]);
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close();
        break;
      case "Tab":
        // Leaving the menu with Tab closes it instead of walking behind it.
        close(false);
        break;
      default:
        break;
    }
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <IconButton
        ref={triggerRef}
        label={label}
        variant={triggerVariant}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        onClick={() => {
          const nextOpen = !isOpen;
          setIsOpen(nextOpen);
          if (nextOpen) {
            setActiveIndex(enabledIndexes[0] ?? 0);
          }
        }}
      >
        {trigger ?? <span aria-hidden="true">⋯</span>}
      </IconButton>

      {isOpen ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={handleMenuKeyDown}
          className={cn(
            "absolute z-30 min-w-[13rem] animate-pop-in",
            "overflow-hidden rounded-xl border border-node-border bg-surface-overlay py-1 shadow-2xl",
            placement === "top" ? "bottom-full mb-2" : "top-full mt-2",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          {items.length === 0 ? (
            <p className="px-4 py-3 text-sm text-canvas-muted">No actions available</p>
          ) : (
            items.map((item, index) => (
              <button
                key={item.value}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                tabIndex={index === activeIndex ? 0 : -1}
                onClick={() => select(item.value)}
                className={cn(
                  "flex min-h-touch-target w-full items-center gap-3 px-4 text-left text-sm",
                  "transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  item.isDanger
                    ? "text-danger hover:bg-danger-soft"
                    : "text-canvas-text hover:bg-node-surface-hover",
                  index === activeIndex && (item.isDanger ? "bg-danger-soft" : "bg-node-surface-hover"),
                )}
              >
                {item.icon ? (
                  <span aria-hidden="true" className="flex size-4 shrink-0 items-center justify-center">
                    {item.icon}
                  </span>
                ) : null}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.shortcut ? (
                  <kbd className="shrink-0 text-xs text-canvas-muted">{item.shortcut}</kbd>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

export default Dropdown;
