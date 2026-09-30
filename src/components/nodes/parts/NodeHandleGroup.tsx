"use client";

import { Handle, Position } from "@xyflow/react";
import { useMindMapStore } from "@/store/useMindMapStore";
import { resolveBranchColor } from "@/lib/nodeFactory";
import { NODE_HANDLE_IDS, type NodeDirection, type NodeHandleId } from "@/types/mindmap";
import { cn } from "@/lib/cn";

/**
 * The connection handles of a node.
 *
 * Every one of the eight standard handles is mounted on every node, at all
 * times, and only its visibility follows the layout. That is not a stylistic
 * choice but the contract with the layout engine plus React Flow:
 *
 * - the layout engine wires every edge to an id from `NODE_HANDLE_IDS`, and a
 *   persisted document keeps whatever ids it was saved with;
 * - React Flow resolves an edge by looking its handle id up in the DOM. An id
 *   that resolves to nothing makes it log error #008 and render no path at all.
 *
 * Mounting the horizontal pair only in a horizontal layout therefore made every
 * radial edge invisible the moment the direction changed, and the same edges
 * stayed invisible after a reload, because the document still asked for the
 * vertical handles while the component rendered horizontal ones.
 *
 * A hidden handle is transparent, non interactive and removed from the
 * accessibility tree rather than unmounted: it costs one empty div per face,
 * keeps the DOM stable across a direction change, and guarantees React Flow can
 * always resolve an id it has been handed.
 *
 * The root is the one exception to "all eight": it has no parent, so it renders
 * no target at all.
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

/** One face of the node box, permanently mounted. */
interface HandleFace {
  id: NodeHandleId;
  position: Position;
  /** Whether the current layout routes edges through this face. */
  active: boolean;
}

export function NodeHandleGroup({
  direction,
  depth,
  isRoot,
  isConnectable,
}: NodeHandleGroupProps): React.JSX.Element {
  const layoutDirection = useMindMapStore((state) => state.layoutOptions.direction);
  const isRadial = layoutDirection === "RADIAL";
  const branchColor = resolveBranchColor(depth);

  /**
   * Which face the parent's edge arrives on, and which face the children hang
   * off. This is the mirror image of `resolveEdgeHandleIds` for a horizontal
   * layout: a node on the RIGHT receives on its LEFT face and emits from its
   * RIGHT, a node on the LEFT the other way round. `CENTER` only occurs on the
   * root, which never renders a target anyway.
   */
  const onLeft = direction === "LEFT";

  const targets: readonly HandleFace[] = [
    { id: NODE_HANDLE_IDS.LEFT_TARGET, position: Position.Left, active: !isRadial && !onLeft },
    { id: NODE_HANDLE_IDS.RIGHT_TARGET, position: Position.Right, active: !isRadial && onLeft },
    { id: NODE_HANDLE_IDS.TOP_TARGET, position: Position.Top, active: isRadial },
    { id: NODE_HANDLE_IDS.BOTTOM_TARGET, position: Position.Bottom, active: isRadial },
  ];

  const sources: readonly HandleFace[] = [
    { id: NODE_HANDLE_IDS.LEFT_SOURCE, position: Position.Left, active: !isRadial && onLeft },
    { id: NODE_HANDLE_IDS.RIGHT_SOURCE, position: Position.Right, active: !isRadial && !onLeft },
    { id: NODE_HANDLE_IDS.TOP_SOURCE, position: Position.Top, active: isRadial },
    { id: NODE_HANDLE_IDS.BOTTOM_SOURCE, position: Position.Bottom, active: isRadial },
  ];

  const style = { backgroundColor: branchColor };

  const renderFace = (face: HandleFace, type: "source" | "target"): React.JSX.Element => (
    <Handle
      key={face.id}
      id={face.id}
      type={type}
      position={face.position}
      isConnectable={isConnectable}
      style={face.active ? style : undefined}
      className={face.active ? cn(handleClass, isConnectable && visibleHandleClass) : HIDDEN_HANDLE_CLASS}
      aria-hidden={!face.active}
      aria-label={type === "target" ? "Incoming branch" : "Outgoing branch"}
    />
  );

  return (
    <>
      {!isRoot && targets.map((face) => renderFace(face, "target"))}
      {sources.map((face) => renderFace(face, "source"))}
    </>
  );
}

/** Faint by default so a resting map is not covered in dots. */
const handleClass =
  "!h-3.5 !w-3.5 !min-h-0 !min-w-0 !border-0 !opacity-30 transition-[opacity,transform] duration-150 hover:!scale-125 hover:!opacity-100";

const visibleHandleClass = "!opacity-60";

/**
 * Applies the hidden state as a complete class list rather than as extra
 * utilities on top of `handleClass`.
 *
 * `handleClass` carries `!opacity-30`, and two `!important` utilities on the
 * same property are resolved by stylesheet order, not by the order they were
 * written in. Replacing the class list outright is the only way to be certain
 * the face really is invisible.
 */
const HIDDEN_HANDLE_CLASS = "!bg-transparent !opacity-0 !pointer-events-none";