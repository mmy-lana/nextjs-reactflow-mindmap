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

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** Optional supporting copy rendered under the title. */
  description?: string;
  children: ReactNode;
  /** Rendered in the header, before the close button. */
  headerAction?: ReactNode;
  /** Rendered in a sticky footer. */
  footer?: ReactNode;
  /** Constrains the panel width. */
  size?: "sm" | "md" | "lg";
  /** Whether tapping the backdrop dismisses the dialog. */
  closeOnBackdrop?: boolean;
}

const SIZE_STYLES: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-3xl",
};

/**
 * Accessible dialog rendered in a portal above the canvas.
 *
 * Renders nothing until mounted, because `createPortal` needs a real document;
 * the caller can keep `isOpen` in state without guarding the render itself.
 * Escape, backdrop dismissal and focus trapping are delegated to
 * {@link useOverlayA11y}.
 */
export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  headerAction,
  footer,
  size = "md",
  closeOnBackdrop = true,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm animate-fade-in sm:items-center sm:p-6"
      onClick={handleBackdropClick}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl",
          "border border-node-border bg-surface-raised shadow-2xl outline-none",
          "animate-sheet-in sm:animate-pop-in",
          SIZE_STYLES[size],
        )}
      >
        <header className="flex items-start gap-3 border-b border-node-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base font-semibold text-canvas-text">{title}</h2>
            {description ? (
              <p className="mt-1 text-sm text-canvas-muted">{description}</p>
            ) : null}
          </div>
          {headerAction}
          <IconButton
            label="Close dialog"
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

export default Modal;
