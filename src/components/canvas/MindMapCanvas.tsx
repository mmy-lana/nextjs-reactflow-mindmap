"use client";

import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  type EdgeTypes,
  type IsValidConnection,
  type NodeTypes,
  type OnConnect,
  type OnEdgesChange,
  type OnMoveEnd,
  type OnNodesChange,
  type OnSelectionChangeFunc,
} from "@xyflow/react";
import { useMindMapStore } from "@/store/useMindMapStore";
import { CanvasGrid } from "@/components/canvas/CanvasGrid";
import { MinimapOverlay } from "@/components/canvas/MinimapOverlay";
import { ViewportControls } from "@/components/canvas/ViewportControls";
import { RootNode } from "@/components/nodes/RootNode";
import { BranchNode } from "@/components/nodes/BranchNode";
import { LeafNode } from "@/components/nodes/LeafNode";
import { OrganicBranchEdge } from "@/components/edges/OrganicBranchEdge";
import { collectDescendants } from "@/lib/treeTransforms";
import type { CanvasEdge, CanvasNode } from "@/types/mindmap";

/**
 * The map surface.
 *
 * This component owns no state of its own: the map lives in the store, so the
 * toolbar, the drawers and the keyboard layer all observe the same nodes.
 * `nodeTypes` and `edgeTypes` are declared at module scope on purpose — a fresh
 * object literal on every render would unmount and remount every node.
 */

const NODE_TYPES: NodeTypes = {
  root: RootNode,
  branch: BranchNode,
  leaf: LeafNode,
};

const EDGE_TYPES: EdgeTypes = {
  organic: OrganicBranchEdge,
};

const CONNECTION_LINE_STYLE = {
  stroke: 'var(--color-accent)',
  strokeWidth: 2,
} as const;

/** Zoom range; the upper bound keeps a small map from turning into a poster. */
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;

export function MindMapCanvas(): React.JSX.Element {
  const nodes = useMindMapStore((state) => state.nodes);
  const edges = useMindMapStore((state) => state.edges);
  const meta = useMindMapStore((state) => state.meta);
  const onNodesChange = useMindMapStore((state) => state.onNodesChange);
  const onEdgesChange = useMindMapStore((state) => state.onEdgesChange);
  const onConnect = useMindMapStore((state) => state.onConnect);
  const setSelectedNodeId = useMindMapStore((state) => state.setSelectedNodeId);
  const updateViewport = useMindMapStore((state) => state.updateViewport);

  const rootNodeId = useMemo(
    () => nodes.find((node) => node.data.depth === 0)?.id ?? null,
    [nodes],
  );

  /**
   * A fresh document records the identity viewport, and a document the user has
   * panned records a different one. Treating "still at the identity" as "never
   * looked at" is what makes a new map open fully visible while a map that was
   * left mid-way reopens exactly where it was.
   */
  const hasStoredViewport = useMemo(
    () =>
      meta !== null && (meta.viewport.x !== 0 || meta.viewport.y !== 0 || meta.viewport.zoom !== 1),
    [meta],
  );

  const onMoveEnd = useCallback<OnMoveEnd>(
    (event, viewport) => {
      /**
       * Framing is not an edit.
       *
       * React Flow reports its own programmatic moves (the opening `fitView`,
       * a zoom from a control that calls `getViewport`) with a null event, and
       * a real drag or pinch with the pointer event that caused it. Writing
       * the viewport back to the document on the first kind marked a freshly
       * opened map as having unsaved changes before the user had touched
       * anything, which is the state the dirty badge is supposed to rule out.
       */
      if (event === null) {
        return;
      }
      updateViewport({ x: viewport.x, y: viewport.y, zoom: viewport.zoom });
    },
    [updateViewport],
  );

  const onSelectionChange = useCallback<OnSelectionChangeFunc<CanvasNode, CanvasEdge>>(
    ({ nodes: selected }) => {
      // A multi-selection still needs one subject for the inspector and the
      // keyboard: the first node the user picked.
      setSelectedNodeId(selected[0]?.id ?? null);
    },
    [setSelectedNodeId],
  );

  /**
   * Refuses a drop that would damage the tree.
   *
   * Four rules, all of which the store re-checks in `onConnect`: this callback
   * only saves the user the flicker of a connection that is about to be
   * rejected, and it never guarantees the result.
   *
   * 1. The root is the anchor of every layout. A child attached to it would
   *    give the map a second root.
   * 2. A node cannot be its own child.
   * 3. A node cannot hang below itself. `collectDescendants` is cycle guarded, so
   *    a graph that already contains a loop still terminates here.
   * 4. A node has exactly one parent, so a target that already has an inbound
   *    edge is not a legal drop site.
   */
  const isValidConnection = useCallback<IsValidConnection<CanvasEdge>>(
    (connection) => {
      if (connection.source === null || connection.target === null) {
        return false;
      }
      if (connection.source === connection.target) {
        return false;
      }
      if (connection.target === rootNodeId) {
        return false;
      }
      if (collectDescendants(connection.target, edges).includes(connection.source)) {
        return false;
      }
      return !edges.some((edge) => edge.target === connection.target);
    },
    [edges, rootNodeId],
  );

  return (
    <div className="relative size-full bg-canvas-bg" data-canvas-root>
      <ReactFlow<CanvasNode, CanvasEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodesChange={onNodesChange as OnNodesChange<CanvasNode>}
        onEdgesChange={onEdgesChange as OnEdgesChange<CanvasEdge>}
        onConnect={onConnect as OnConnect}
        onMoveEnd={onMoveEnd}
        onSelectionChange={onSelectionChange}
        isValidConnection={isValidConnection}
        connectionLineStyle={CONNECTION_LINE_STYLE}
        // The store owns the viewport so it can be persisted; React Flow only
        // needs the value the document opens at.
        defaultViewport={meta?.viewport}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        // Deletion, collapse and rename belong to the keyboard layer, which
        // knows about subtrees and history. Two handlers for one key press would
        // delete a subtree twice.
        deleteKeyCode={null}
        selectionKeyCode="Shift"
        // A long press and drag selects a region on touch, which is how a phone
        // user reaches several nodes at once.
        selectionOnDrag
        panOnDrag={[1, 2]}
        panOnScroll={false}
        fitView={!hasStoredViewport}
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        proOptions={{ hideAttribution: true }}
        className="bg-canvas-bg"
        aria-label="Mind map canvas"
      >
        <CanvasGrid />
        <ViewportControls />
        <MinimapOverlay />
      </ReactFlow>
    </div>
  );
}
