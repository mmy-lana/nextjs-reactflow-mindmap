"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** Visual weight of a button. */
export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

/**
 * Height of the control. Every size is at least `touch-target` (44px) so the
 * button stays usable with a thumb on a phone.
 */
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-white border border-transparent hover:bg-accent-hover active:bg-accent-hover",
  secondary:
    "bg-node-surface text-canvas-text border border-node-border hover:bg-node-surface-hover hover:border-node-border-active",
  danger:
    "bg-danger-soft text-danger border border-danger/40 hover:bg-danger hover:border-danger hover:text-white",
  ghost:
    "bg-transparent text-canvas-muted border border-transparent hover:bg-node-surface hover:text-canvas-text",
};

const SIZE_STYLES: Record<ButtonSize, string> = {
  sm: "min-h-touch-target px-3 text-sm gap-1.5",
  md: "min-h-touch-target px-4 text-sm gap-2",
  lg: "min-h-touch-target px-5 text-base gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renders a spinner and blocks interaction. */
  isLoading?: boolean;
  /** Stretches the button to the width of its container. */
  fullWidth?: boolean;
}

/**
 * Touch-first button.
 *
 * Defaults to `type="button"`: most instances live on the canvas, where an
 * untyped button would submit the closest form and reload the route.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    isLoading = false,
    fullWidth = false,
    className,
    children,
    disabled,
    type,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      disabled={disabled === true || isLoading}
      aria-busy={isLoading || undefined}
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium",
        "transition-colors duration-150 select-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT_STYLES[variant],
        SIZE_STYLES[size],
        fullWidth && "w-full",
        className,
      )}
      {...rest}
    >
      {isLoading ? (
        <span
          aria-hidden="true"
          className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {children}
    </button>
  );
});
