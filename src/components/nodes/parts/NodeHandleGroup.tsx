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

  // Which face each id belongs to is fixed, and it is the mirror image of
  // `resolveEdgeHandleIds` in the pure layout engine:
  //
  // - a node on the RIGHT receives its parent edge on its LEFT face and hands
  //   its own children a RIGHT source;
  // - a node on the LEFT receives it on its RIGHT face and hands out a LEFT
  //   source.
  //
  // The parent always attaches to the side facing it, which is what keeps the
  // generated bezier running away from the parent instead of looping back over
  // the child's own box. `CENTER` only occurs on the root, which returns before
  // this point.
  const onLeft = direction === 'LEFT';

  return (
    <>
      {/* The handle the parent's edge arrives on. */}
      {!isRoot && (
        <Handle
          id={onLeft ? NODE_HANDLE_IDS.RIGHT_TARGET : NODE_HANDLE_IDS.LEFT_TARGET}
          type="target"
          position={onLeft ? Position.Right : Position.Left}
          isConnectable={isConnectable}
          style={style}
          className={cn(handleClass, isConnectable && visibleHandleClass)}
          aria-label="Incoming branch"
        />
      )}
      {/* The handle children hang off. */}
      <Handle
        id={onLeft ? NODE_HANDLE_IDS.LEFT_SOURCE : NODE_HANDLE_IDS.RIGHT_SOURCE}
        type="source"
        position={onLeft ? Position.Left : Position.Right}
        isConnectable={isConnectable}
        style={style}
        className={cn(handleClass, isConnectable && visibleHandleClass)}
        aria-label="Outgoing branch"
      />
      {/* The mirrored pair, invisible but still legal: a node keeps both
          orientations available so a connection can be made in any direction
          without this component knowing where the layout decided to route. */}
      {!isRoot && (
        <Handle
          id={onLeft ? NODE_HANDLE_IDS.LEFT_TARGET : NODE_HANDLE_IDS.RIGHT_TARGET}
          type="target"
          position={onLeft ? Position.Left : Position.Right}
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
