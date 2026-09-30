"use client";

import { Background, BackgroundVariant } from "@xyflow/react";

/**
 * The dot grid behind the nodes.
 *
 * `<Background>` is bound to the viewport transform, so the pattern pans and
 * zooms with the map without any scroll handling of its own. The colour comes
 * from the theme token rather than a literal, so the grid follows the canvas
 * background if the theme is ever adjusted.
 */

const DOT_GAP = 24;
const DOT_SIZE = 1.5;

export function CanvasGrid(): React.JSX.Element {
  return (
    <Background
      id="mind-map-dot-grid"
      variant={BackgroundVariant.Dots}
      gap={DOT_GAP}
      size={DOT_SIZE}
      color="var(--color-canvas-dot)"
      patternClassName="canvas-dot-grid-pattern"
    />
  );
}
