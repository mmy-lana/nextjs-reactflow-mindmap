"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Visual treatment of an icon button. */
export type IconButtonVariant = "solid" | "surface" | "ghost" | "danger";

/** Square edge length. All values respect the 44px minimum tap area. */
export type IconButtonSize = "sm" | "md" | "lg";

const VARIANT_STYLES: Record<IconButtonVariant, string> = {
  solid: "bg-accent text-white border border-transparent hover:bg-accent-hover",
  surface:
    "bg-node-surface text-canvas-text border border-node-border hover:bg-node-surface-hover hover:border-node-border-active",
  ghost:
    "bg-transparent text-canvas-muted border border-transparent hover:bg-node-surface hover:text-canvas-text",
  danger:
    "bg-danger-soft text-danger border border-danger/40 hover:bg-danger hover:border-danger hover:text-white",
};

const SIZE_STYLES: Record<IconButtonSize, string> = {
  sm: "size-touch-target",
  md: "size-touch-target",
  lg: "size-14",
};

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Accessible name. Required even when the content is an icon, because an
   * icon alone exposes nothing to a screen reader.
   */
  label: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  /** Icon element, usually a `lucide-react` component with `aria-hidden`. */
  children: ReactNode;
  /** Renders in the pressed state of a toggle. */
  isActive?: boolean;
}

/**
 * Square, touch sized button wrapping a single icon.
 *
 * The accessible name is always applied even though the visual label is hidden
 * from sighted users, so the control is never announced as "button".
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    label,
    variant = "surface",
    size = "md",
    isActive = false,
    className,
    children,
    type,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      title={label}
      aria-label={label}
      aria-pressed={isActive || undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg",
        "transition-colors duration-150 select-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT_STYLES[variant],
        SIZE_STYLES[size],
        isActive && "border-node-border-active text-canvas-text",
        className,
      )}
      {...rest}
    >
      <span aria-hidden="true" className="flex items-center justify-center">
        {children}
      </span>
    </button>
  );
});
