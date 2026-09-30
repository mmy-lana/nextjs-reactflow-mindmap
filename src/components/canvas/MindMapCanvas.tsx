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
    (_event, viewport) => {
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
   * Refuses a drop that would give a node a second parent or close a cycle.
   * The store enforces the same rule, so this only saves the user the flicker
   * of a connection that is about to be rejected.
   */
  const isValidConnection = useCallback<IsValidConnection<CanvasEdge>>(
    (connection) => {
      if (connection.source === null || connection.target === null) {
        return false;
      }
      if (connection.source === connection.target) {
        return false;
      }
      return !edges.some((edge) => edge.target === connection.target);
    },
    [edges],
  );

  return (
    <div className="relative size-full bg-canvas-bg">
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
