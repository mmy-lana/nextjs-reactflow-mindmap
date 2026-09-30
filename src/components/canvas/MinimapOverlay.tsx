"use client";

import { useState } from "react";
import { MiniMap, Panel } from "@xyflow/react";
import { useVisualViewport } from "@/hooks/useVisualViewport";
import { BRANCH_COLOR_PALETTE } from "@/types/mindmap";
import { cn } from "@/lib/cn";

/**
 * The minimap, sized to the space the viewport actually has.
 *
 * Three states, because a minimap squeezed into a phone screen is worse than
 * one that is folded away: below 430px it is not rendered at all (there is no
 * room beside the map it would mirror), between 430px and 768px it collapses to
 * a single button that opens it, and from 768px up it is always visible.
 */

/** Below this width the minimap is not rendered at all. */
const HIDDEN_BELOW_PX = 430;
/** From this width up the minimap is always open. */
const ALWAYS_OPEN_FROM_PX = 768;

export function MinimapOverlay(): React.JSX.Element | null {
  const { width } = useVisualViewport();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed || width < HIDDEN_BELOW_PX) {
    return null;
  }

  const isCompact = width < ALWAYS_OPEN_FROM_PX;
  const isOpen = !isCompact || isExpanded;

  if (isCompact && !isOpen) {
    return (
      <Panel position="bottom-right" className="m-3">
        <button
          type="button"
          aria-label="Show minimap"
          aria-expanded={false}
          onClick={() => {
            setIsExpanded(true);
          }}
          className="flex size-touch-target items-center justify-center rounded-xl border border-node-border bg-node-surface/90 text-canvas-muted backdrop-blur-sm transition-colors hover:text-canvas-text"
        >
          <MinimapGlyph />
        </button>
      </Panel>
    );
  }

  return (
    <Panel position="bottom-right" className="m-3 flex flex-col items-end gap-2">
      {isCompact && (
        <button
          type="button"
          aria-label="Hide minimap"
          onClick={() => {
            setIsExpanded(false);
          }}
          className="flex size-touch-target items-center justify-center rounded-xl border border-node-border bg-node-surface/90 text-canvas-muted backdrop-blur-sm transition-colors hover:text-canvas-text"
        >
          <MinimapGlyph />
        </button>
      )}
      <div className="animate-pop-in relative rounded-xl border border-node-border bg-node-surface/90 backdrop-blur-sm">
        <MiniMap
          pannable
          zoomable
          // Thick enough to aim at a branch without zooming the minimap itself.
          nodeStrokeWidth={2}
          nodeBorderRadius={4}
          nodeColor={(node) => {
            const depth = typeof node.data?.depth === 'number' ? node.data.depth : 0;
            return BRANCH_COLOR_PALETTE[Math.min(depth, BRANCH_COLOR_PALETTE.length - 1)];
          }}
          maskColor="rgba(12, 13, 14, 0.72)"
          className="!rounded-xl"
        />
        {!isCompact && (
          <button
            type="button"
            aria-label="Hide minimap"
            onClick={() => {
              setIsDismissed(true);
            }}
            className="absolute -top-2 -right-2 flex size-7 items-center justify-center rounded-full border border-node-border bg-surface-overlay text-canvas-muted shadow-lg transition-colors hover:text-canvas-text"
          >
            <MinimapGlyph />
          </button>
        )}
      </div>
    </Panel>
  );
}

/** A tiny map outline, drawn inline so the control carries no icon dependency. */
function MinimapGlyph(): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={cn('size-4', 'shrink-0')}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <rect x="1.5" y="4.5" width="5" height="7" rx="1.2" />
      <rect x="9.5" y="1.5" width="5" height="4" rx="1.2" />
      <rect x="9.5" y="10.5" width="5" height="4" rx="1.2" />
    </svg>
  );
}
