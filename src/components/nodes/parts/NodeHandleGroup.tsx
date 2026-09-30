"use client";

import { Handle, Position } from "@xyflow/react";
import { useMindMapStore } from "@/store/useMindMapStore";
import { resolveBranchColor } from "@/lib/nodeFactory";
import { NODE_HANDLE_IDS, type NodeDirection } from "@/types/mindmap";
import { cn } from "@/lib/cn";

/**
 * The connection handles of a node.
 *
 * The ids are the contract with the pure layout engine: `wireEdges` points
 * every branch edge at one of `NODE_HANDLE_IDS`, so a renamed or missing handle
 * would silently detach the whole branch. The ids are therefore imported from
 * the shared constant rather than typed out here.
 *
 * A branch renders a source *and* a target on both sides. Only one pair is used
 * by the layout for a given node, but having all four keeps a connection
 * possible in any direction without this component needing to know where the
 * layout decided to route the edges. The pair the layout does not use is
 * invisible yet still grabbable, so it costs nothing visually.
 */

export interface NodeHandleGroupProps {
  /** Side of the root this node belongs to. */
  direction: NodeDirection;
  /** Generation index, which decides the handle colour. */
  depth: number;
  /** The root has no parent, so it renders sources only. */
  isRoot: boolean;
  /** Mirrors `nodesConnectable`, so a read-only canvas has no live handles. */
  isConnectable: boolean;
}

export function NodeHandleGroup({
  direction,
  depth,
  isRoot,
  isConnectable,
}: NodeHandleGroupProps): React.JSX.Element {
  // The layout decides which handles are wired, so the rendered set has to
  // follow it: a radial pass wires the top source and the bottom target.
  const layoutDirection = useMindMapStore((state) => state.layoutOptions.direction);
  const branchColor = resolveBranchColor(depth);

  const style = { backgroundColor: branchColor };

  if (layoutDirection === 'RADIAL') {
    return (
      <>
        {!isRoot && (
          <Handle
            id={NODE_HANDLE_IDS.BOTTOM_TARGET}
            type="target"
            position={Position.Bottom}
            isConnectable={isConnectable}
            style={style}
            className={cn(handleClass, isConnectable && visibleHandleClass)}
            aria-label="Incoming branch"
          />
        )}
        <Handle
          id={NODE_HANDLE_IDS.TOP_SOURCE}
          type="source"
          position={Position.Top}
          isConnectable={isConnectable}
          style={style}
          className={cn(handleClass, isConnectable && visibleHandleClass)}
          aria-label="Outgoing branch"
        />
      </>
    );
  }

  // The side a node grows towards carries the source the layout wires; the
  // opposite side is where its own parent edge arrives. `CENTER` only occurs on
  // the root, which returns before this point.
  const onLeft = direction === 'LEFT';
  const sourceId = onLeft ? NODE_HANDLE_IDS.LEFT_SOURCE : NODE_HANDLE_IDS.RIGHT_SOURCE;
  const targetId = onLeft ? NODE_HANDLE_IDS.LEFT_TARGET : NODE_HANDLE_IDS.RIGHT_TARGET;

  return (
    <>
      {!isRoot && (
        <Handle
          id={targetId}
          type="target"
          position={onLeft ? Position.Left : Position.Right}
          isConnectable={isConnectable}
          style={style}
          className={cn(handleClass, isConnectable && visibleHandleClass)}
          aria-label="Incoming branch"
        />
      )}
      <Handle
        id={sourceId}
        type="source"
        position={onLeft ? Position.Left : Position.Right}
        isConnectable={isConnectable}
        style={style}
        className={cn(handleClass, isConnectable && visibleHandleClass)}
        aria-label="Outgoing branch"
      />
      {/* Invisible, but still a legal origin for a drag. */}
      {!isRoot && (
        <Handle
          id={onLeft ? NODE_HANDLE_IDS.RIGHT_TARGET : NODE_HANDLE_IDS.LEFT_TARGET}
          type="target"
          position={onLeft ? Position.Right : Position.Left}
          isConnectable={isConnectable}
          className="!bg-transparent"
          aria-label="Incoming branch"
        />
      )}
      <Handle
        id={onLeft ? NODE_HANDLE_IDS.RIGHT_SOURCE : NODE_HANDLE_IDS.LEFT_SOURCE}
        type="source"
        position={onLeft ? Position.Right : Position.Left}
        isConnectable={isConnectable}
        className="!bg-transparent"
        aria-label="Outgoing branch"
      />
    </>
  );
}

/** Faint by default so a resting map is not covered in dots. */
const handleClass =
  '!h-3.5 !w-3.5 !min-h-0 !min-w-0 !border-0 !opacity-30 transition-[opacity,transform] duration-150 hover:!scale-125 hover:!opacity-100';

const visibleHandleClass = '!opacity-60';
