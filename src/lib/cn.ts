/**
 * Conditional class name composition.
 *
 * `clsx` resolves the conditional/falsy syntax and `tailwind-merge` collapses
 * conflicting Tailwind utilities so a caller can always override a component
 * default (for example `className="px-2"` on a `Button` that ships `px-4`).
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export type { ClassValue };
