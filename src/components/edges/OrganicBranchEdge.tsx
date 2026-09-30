"use client";

import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import type { CanvasEdge, MindMapEdgeData } from "@/types/mindmap";

/**
 * The only edge renderer on the canvas.
 *
 * A branch is drawn as a single bezier whose curvature grows with the distance
 * between the two nodes, which is what makes a long edge read as an organic
 * branch rather than a stretched line. Stroke weight and opacity taper with the
 * generation index, so a deep subtree recedes instead of competing with the
 * first level of branches.
 */

const MAX_STROKE_WIDTH = 2.5;
const MIN_STROKE_WIDTH = 1.25;
const MAX_STROKE_OPACITY = 0.9;
const MIN_STROKE_OPACITY = 0.35;

function OrganicBranchEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
  selected,
  style,
}: EdgeProps<CanvasEdge>): React.JSX.Element {
  const edgeData: MindMapEdgeData = data ?? {};
  const depth = Math.max(edgeData.depth ?? 1, 1);
  const label = typeof edgeData.label === 'string' ? edgeData.label : undefined;

  // More bend the further apart the two nodes are, capped so that a zoomed-out
  // canvas does not turn every edge into a loop.
  const distance = Math.hypot(targetX - sourceX, targetY - sourceY);
  const curvature = Math.min(Math.max(distance / 420, 0.12), 0.6);

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature,
  });

  const taper = 1 / (1 + (depth - 1) * 0.22);
  const strokeWidth =
    edgeData.strokeWidth ?? MAX_STROKE_WIDTH - (MAX_STROKE_WIDTH - MIN_STROKE_WIDTH) * (1 - taper);
  const opacity = Math.max(MIN_STROKE_OPACITY, MAX_STROKE_OPACITY * taper);

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        className="transition-opacity duration-150"
        style={{
          ...style,
          stroke: edgeData.branchColor ?? 'var(--color-accent)',
          strokeWidth,
          strokeOpacity: selected ? Math.min(1, opacity + 0.25) : opacity,
          strokeDasharray: edgeData.dashed === true ? '6 4' : undefined,
        }}
      />
      {label ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-md border border-node-border bg-surface-overlay/95 px-1.5 py-0.5 text-[11px] whitespace-nowrap text-canvas-muted"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const OrganicBranchEdge = memo(OrganicBranchEdgeComponent);
