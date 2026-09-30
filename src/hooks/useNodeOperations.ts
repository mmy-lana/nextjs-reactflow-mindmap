"use client";

import { useMemo } from "react";
import { useMindMapStore } from "@/store/useMindMapStore";
import { collectDescendants, getChildNodes, getSiblingNodes, sortSiblingsByOrder } from "@/lib/treeTransforms";
import type { CanvasNode, NodeDirection, NodeStatus } from "@/types/mindmap";

/**
 * Node level commands for the UI.
 *
 * The store already exposes every mutation; this hook exists so components can
 * take one object instead of subscribing to the whole store, and so the
 * derived lookups a menu needs are computed once per canvas change rather than
 * on every render of every menu item.
 */
export interface UseNodeOperationsResult {
  /** The selected node, or `null` when nothing is selected. */
  selectedNode: CanvasNode | null;
  /** Children of the selected node, in `order`. */
  selectedChildren: CanvasNode[];
  /** Siblings of the selected node, in `order`, excluding the node itself. */
  selectedSiblings: CanvasNode[];
  /** Number of nodes in the selected node's subtree, including itself. */
  selectedSubtreeSize: number;
  selectNode: (nodeId: string | null) => void;
  addChild: (parentId: string, direction?: NodeDirection) => void;
  addSibling: (nodeId: string) => void;
  renameNode: (nodeId: string, label: string) => void;
  setNotes: (nodeId: string, notes: string) => void;
  setStatus: (nodeId: string, status: NodeStatus | undefined) => void;
  setTags: (nodeId: string, tags: string[]) => void;
  toggleCollapse: (nodeId: string) => void;
  removeNode: (nodeId: string) => void;
}

export function useNodeOperations(): UseNodeOperationsResult {
  const nodes = useMindMapStore((state) => state.nodes);
  const edges = useMindMapStore((state) => state.edges);
  const selectedNodeId = useMindMapStore((state) => state.selectedNodeId);

  const selectNode = useMindMapStore((state) => state.setSelectedNodeId);
  const addNode = useMindMapStore((state) => state.addNode);
  const addSibling = useMindMapStore((state) => state.addSibling);
  const updateNodeLabel = useMindMapStore((state) => state.updateNodeLabel);
  const updateNodeNotes = useMindMapStore((state) => state.updateNodeNotes);
  const updateNodeStatus = useMindMapStore((state) => state.updateNodeStatus);
  const updateNodeTags = useMindMapStore((state) => state.updateNodeTags);
  const toggleSubtreeCollapse = useMindMapStore((state) => state.toggleSubtreeCollapse);
  const deleteSubtree = useMindMapStore((state) => state.deleteSubtree);

  const selectedNode = useMemo(
    () => (selectedNodeId ? (nodes.find((node) => node.id === selectedNodeId) ?? null) : null),
    [nodes, selectedNodeId],
  );

  // The lookups are derived from the arrays themselves, so a new array identity
  // is the only signal that they can be stale.
  const selectedChildren = useMemo(
    () =>
      selectedNode ? sortSiblingsByOrder(getChildNodes(selectedNode.id, nodes, edges)) : [],
    [selectedNode, nodes, edges],
  );

  const selectedSiblings = useMemo(
    () =>
      selectedNode
        ? getSiblingNodes(selectedNode, nodes, edges).filter((node) => node.id !== selectedNode.id)
        : [],
    [selectedNode, nodes, edges],
  );

  const selectedSubtreeSize = useMemo(
    () => (selectedNode ? 1 + collectDescendants(selectedNode.id, edges).length : 0),
    [selectedNode, edges],
  );

  return useMemo(
    () => ({
      selectedNode,
      selectedChildren,
      selectedSiblings,
      selectedSubtreeSize,
      selectNode,
      addChild: addNode,
      addSibling,
      renameNode: updateNodeLabel,
      setNotes: updateNodeNotes,
      setStatus: updateNodeStatus,
      setTags: updateNodeTags,
      toggleCollapse: toggleSubtreeCollapse,
      removeNode: deleteSubtree,
    }),
    [
      selectedNode,
      selectedChildren,
      selectedSiblings,
      selectedSubtreeSize,
      selectNode,
      addNode,
      addSibling,
      updateNodeLabel,
      updateNodeNotes,
      updateNodeStatus,
      updateNodeTags,
      toggleSubtreeCollapse,
      deleteSubtree,
    ],
  );
}
