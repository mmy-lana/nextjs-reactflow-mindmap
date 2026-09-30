"use client";

import { NODE_STATUS_META, type NodeStatus } from "@/types/mindmap";
import { cn } from "@/lib/cn";

/**
 * The workflow state of a node, rendered as a small tinted pill.
 *
 * Status is the one piece of node metadata that is not visible from the label
 * alone, so it is announced rather than only coloured: the pill carries its own
 * text and the dot is decorative.
 */

export interface NodeStatusBadgeProps {
  status: NodeStatus | undefined;
  /** Adds a top margin; the root stacks its badge under the title. */
  className?: string;
  /** Hides the label and keeps only the dot, for narrow nodes. */
  compact?: boolean;
}

export function NodeStatusBadge({
  status,
  className,
  compact = false,
}: NodeStatusBadgeProps): React.JSX.Element | null {
  if (!status) {
    return null;
  }

  const meta = NODE_STATUS_META[status];
  if (!meta) {
    // A status outside the union cannot be rendered, and guessing a colour
    // would be worse than showing nothing.
    return null;
  }

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 self-start rounded-full px-2 py-0.5 text-[11px] leading-tight font-medium whitespace-nowrap',
        className,
      )}
      style={{ backgroundColor: meta.backgroundColor, color: meta.color }}
    >
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: meta.color }}
      />
      {compact ? (
        <span className="sr-only">{meta.label}</span>
      ) : (
        <span className="truncate">{meta.label}</span>
      )}
    </span>
  );
}
