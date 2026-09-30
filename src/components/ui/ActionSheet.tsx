"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useOverlayA11y } from "@/hooks/useOverlayA11y";
import { IconButton } from "@/components/ui/IconButton";

/**
 * A bottom sheet for secondary actions and small option groups.
 *
 * The toolbar needs somewhere to put everything that does not fit in four
 * buttons, and the layout controls need a surface that will not cover the map.
 * Both get the same component: on a phone it slides up from the bottom edge,
 * where a thumb already is, and from `640px` up it becomes a compact card
 * anchored above the toolbar so the map stays visible next to it.
 */

export interface ActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Rendered under the content, usually the confirm and cancel pair. */
  footer?: ReactNode;
  className?: string;
}

export function ActionSheet({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: ActionSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useOverlayA11y(isOpen, sheetRef, onClose);

  const onBackdropClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  if (!isMounted || !isOpen) {
    return null;
  }

  return createPortal(
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-end justify-center bg-black/50 animate-fade-in',
        'sm:items-end sm:justify-end',
        // From `sm` up the sheet is a card next to the canvas, not a modal over
        // it: dimming the map and swallowing its pointer events made the layout
        // sliders unusable, because the effect of a slider can only be judged by
        // looking at what it moves. The backdrop is gone from this width up and
        // the sheet re-enables pointer events for itself below.
        'sm:bg-transparent sm:pointer-events-none',
      )}
      onClick={onBackdropClick}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "flex max-h-[70vh] w-full flex-col rounded-t-2xl border border-node-border bg-surface-raised",
          "shadow-2xl outline-none animate-sheet-in",
          // A card above the toolbar on anything larger than a phone.
          "sm:pointer-events-auto sm:mb-24 sm:mr-6 sm:max-h-[60vh] sm:w-96 sm:rounded-2xl sm:border",
          className,
        )}
      >
        <header className="flex items-start gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-canvas-text">{title}</h2>
            {description ? <p className="mt-1 text-sm text-canvas-muted">{description}</p> : null}
          </div>
          <IconButton label="Close" variant="ghost" size="sm" onClick={onClose} className="-mr-2 -mt-1">
            <X className="size-5" />
          </IconButton>
        </header>

        <div className="scroll-area min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>

        {footer ? (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-node-border bg-surface-sunken/60 px-5 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

export interface ActionSheetItemProps {
  label: string;
  description?: string;
  icon: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  isDanger?: boolean;
  /** Marks the row as the active surface, e.g. an open drawer. */
  isActive?: boolean;
}

/** One row of an action sheet, sized for a fingertip. */
export function ActionSheetItem({
  label,
  description,
  icon,
  onSelect,
  disabled = false,
  isDanger = false,
  isActive = false,
}: ActionSheetItemProps): React.JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      aria-pressed={isActive ? true : undefined}
      className={cn(
        "flex min-h-touch-target w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-40",
        isDanger
          ? "text-danger hover:bg-danger-soft"
          : isActive
            ? "bg-accent-soft text-accent"
            : "text-canvas-text hover:bg-node-surface-hover",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg border border-node-border",
          isDanger ? "bg-danger-soft" : "bg-node-surface",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{label}</span>
        {description ? (
          <span className="mt-0.5 block truncate text-xs text-canvas-muted">{description}</span>
        ) : null}
      </span>
    </button>
  );
}
