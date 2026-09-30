"use client";

import { Controls } from "@xyflow/react";

/**
 * Zoom and fit controls, pinned to the bottom left of the pane.
 *
 * The lock button is omitted on purpose: the map is always editable, and an
 * inert control that silently does nothing is worse than no control. The button
 * size itself is a theme concern and lives in `globals.css`, where every
 * control is already at the 44px touch target minimum.
 */
export function ViewportControls(): React.JSX.Element {
  return (
    <Controls
      position="bottom-left"
      showInteractive={false}
      fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
      aria-label="Canvas zoom"
    />
  );
}
