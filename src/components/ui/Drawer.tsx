"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useOverlayA11y } from "@/hooks/useOverlayA11y";
import { IconButton } from "./IconButton";

/** Viewport width (px) at and above which the drawer docks to the side. */
const DESKTOP_BREAKPOINT = 768;

export type DrawerPlacement = "left" | "right";

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Which edge the panel docks to on desktop. Defaults to `right`. */
  placement?: DrawerPlacement;
  /** Side width on desktop. Ignored in mobile bottom-sheet mode. */
  width?: number;
  /** Pinned above the bottom floating toolbar on mobile. */
  offsetForToolbar?: boolean;
  description?: string;
  footer?: ReactNode;
  closeOnBackdrop?: boolean;
}

/**
 * Responsive side panel: a swipe-up bottom sheet on phones and a docked
 * side drawer from `768px` upwards.
 *
 * The mode is derived from the viewport instead of a media query so the
 * animation class and the layout always agree; `matchMedia` is watched
 * directly because the sheet is rendered in a portal and must react to
 * rotations as well as resizes.
 */
export function Drawer({
  isOpen,
  onClose,
  title,
  children,
  placement = "right",
  width = 360,
  offsetForToolbar = false,
  description,
  footer,
  closeOnBackdrop = true,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const query = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`);
    const sync = (): void => setIsDesktop(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useOverlayA11y(isOpen, panelRef, onClose, { closeOnBackdrop });

  const handleBackdropClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!closeOnBackdrop) {
        return;
      }
      if (event.target !== event.currentTarget) {
        return;
      }
      onClose();
    },
    [closeOnBackdrop, onClose],
  );

  if (!isMounted || !isOpen) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-end bg-black/50 animate-fade-in sm:items-stretch sm:justify-end"
      onClick={handleBackdropClick}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={isDesktop ? { width: `${width}px` } : undefined}
        className={cn(
          "flex w-full flex-col border border-node-border bg-surface-raised shadow-2xl outline-none",
          // Mobile: bottom sheet with a drag affordance.
          "max-h-[85vh] rounded-t-2xl animate-sheet-in",
          // Desktop: full height, docked to one side.
          "sm:max-h-none sm:h-full sm:rounded-none sm:border-y-0",
          placement === "left"
            ? "sm:left-0 sm:border-l-0"
            : "sm:right-0 sm:border-r-0",
          offsetForToolbar && !isDesktop && "pb-[var(--toolbar-safe-offset)]",
        )}
      >
        <header className="flex items-start gap-3 border-b border-node-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-canvas-text">{title}</h2>
            {description ? (
              <p className="mt-1 text-sm text-canvas-muted">{description}</p>
            ) : null}
          </div>
          <IconButton
            label="Close panel"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="-mr-2 -mt-1"
          >
            <X className="size-5" />
          </IconButton>
        </header>

        <div className="scroll-area min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

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

export default Drawer;
