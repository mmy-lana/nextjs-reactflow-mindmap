"use client";

/**
 * Canonical state of a mind map document.
 *
 * Design rules enforced here:
 *
 * - The store owns *truth*; React Flow owns *interaction*. Flow emits changes
 *   and the store applies them, so there is never a second copy of the node
 *   list to fall out of sync.
 * - Every domain mutation ends with a history snapshot and a save, so undo and
 *   persistence can never drift apart.
 * - Persistence is debounced and serialized: a burst of keystrokes produces one
 *   write, and two writes can never interleave inside IndexedDB.
 */

import { create } from "zustand";
import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import {
  MINDMAP_SCHEMA_VERSION,
  MAX_HISTORY_ENTRIES,
  SAVE_DEBOUNCE_MS,
  UNNAMED_DOCUMENT_TITLE,
  type ActiveDrawerType,
  type CanvasEdge,
  type CanvasNode,
  type HistoryEntry,
  type LayoutOptions,
  type MindMapDocument,
  type MindMapExportPayload,
  type NodeDirection,
  type NodeStatus,
  type NodeStyleConfig,
  type ViewportState,
} from "@/types/mindmap";
import {
  createBranchEdge,
  createChildNode,
  resolveBranchColor,
} from "@/lib/nodeFactory";
import {
  buildChildIndex,
  calculateNodeDepth,
  calculateNodeOrder,
  collectDescendants,
  collectHiddenNodeIds,
  findRootNode,
  reindexNodeMetadata,
  sortSiblingsByOrder,
} from "@/lib/treeTransforms";
import { calculateMindMapLayout } from "@/lib/layoutEngine";
import {
  DocumentRepositoryError,
  createDocument,
  getDocument,
  saveDocumentSerialized,
} from "@/db/documentRepository";

/* -------------------------------------------------------------------------- */
/*                              Serialized save queue                          */
/* -------------------------------------------------------------------------- */

let saveQueue: Promise<void> = Promise.resolve();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPayload: MindMapExportPayload | null = null;

/** Drops a scheduled write, if any. */
function cancelPendingSave(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  pendingPayload = null;
}

/**
 * Runs one physical write after every previously queued write settled.
 *
 * The previous promise is swallowed with `.catch()` so a failed write cannot
 * reject the chain and permanently block every later save.
 */
function executeSerializedWrite(payload: MindMapExportPayload): Promise<void> {
  const id = payload.meta.id;
  saveQueue = saveQueue
    .catch(() => undefined)
    .then(() => saveDocumentSerialized(id, payload));
  return saveQueue;
}

function scheduleDebouncedSave(payload: MindMapExportPayload, delayMs: number): void {
  cancelPendingSave();
  pendingPayload = payload;
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    const next = pendingPayload;
    pendingPayload = null;
    if (next) {
      void executeSerializedWrite(next).catch(() => undefined);
    }
  }, delayMs);
}

/**
 * Cancels the debounce window and writes right away.
 *
 * Undo and redo rely on this: restoring an old state while a write for the
 * newer state is still queued would otherwise persist the state the user just
 * discarded.
 */
function flushImmediateSave(payload: MindMapExportPayload): Promise<void> {
  cancelPendingSave();
  return executeSerializedWrite(payload);
}

/**
 * Writes immediately when the page is being hidden.
 *
 * A tab switch or a backgrounded mobile browser can be the last event before
 * the process is frozen, so a still-pending debounce window is flushed rather
 * than dropped. The write is fire-and-forget: there is no reliable moment left
 * to await it.
 */
function installUnloadFlush(): void {
  if (typeof window === "undefined") {
    return;
  }
  const handler = (): void => {
    const next = pendingPayload;
    if (debounceTimer === null || !next) {
      return;
    }
    cancelPendingSave();
    void executeSerializedWrite(next).catch(() => undefined);
  };
  window.addEventListener("pagehide", handler);
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      handler();
    }
  });
}

/* -------------------------------------------------------------------------- */
/*                                   Store shape                               */
/* -------------------------------------------------------------------------- */

/** Lifecycle of the persistence pipeline, surfaced to the toolbar. */
export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export interface MindMapState {
  documentId: string | null;
  meta: MindMapDocument | null;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedNodeId: string | null;
  /** Node whose label is being edited inline, if any. */
  editingNodeId: string | null;
  history: HistoryEntry[];
  historyIndex: number;
  isLayoutRunning: boolean;
  activeDrawer: ActiveDrawerType;
  /** Options consumed by `applyLayout`. */
  layoutOptions: LayoutOptions;
  isHydrating: boolean;
  /** User facing message; never a raw exception. */
  loadError: string | null;
  saveStatus: SaveStatus;
}

export interface MindMapActions {
  loadDocument: (documentId: string) => Promise<void>;
  onNodesChange: (changes: NodeChange<CanvasNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<CanvasEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  pushHistorySnapshot: (description: string) => void;
  scheduleSave: () => void;
  flushSave: () => Promise<void>;
  addNode: (parentId: string, direction?: NodeDirection) => void;
  addSibling: (nodeId: string) => void;
  updateNodeLabel: (id: string, label: string) => void;
  updateNodeNotes: (id: string, notes: string) => void;
  updateNodeStatus: (id: string, status: NodeStatus | undefined) => void;
  updateNodeStyle: (id: string, patch: Partial<NodeStyleConfig>) => void;
  updateNodeTags: (id: string, tags: string[]) => void;
  setNodeDirection: (id: string, direction: NodeDirection) => void;
  deleteSubtree: (nodeId: string) => void;
  toggleSubtreeCollapse: (nodeId: string) => void;
  /**
   * Collapses or expands every branch at once, as a single undo step.
   *
   * Leaves are left untouched: `isCollapsed` on a leaf would be a lie the
   * inspector would have to special case.
   */
  setAllSubtreesCollapsed: (collapsed: boolean) => void;
  applyLayout: (options?: Partial<LayoutOptions>) => void;
  updateViewport: (viewport: ViewportState) => void;
  renameDocument: (title: string) => void;
  updateDocumentDescription: (description: string) => void;
  /**
   * Replaces the whole canvas, used by JSON import.
   *
   * The title is optional so the importer can adopt the file's name or keep the
   * current one. Either way it lands in the same history step as the nodes: an
   * import that half applied is worse than one that is easy to undo.
   */
  replaceCanvas: (
    nodes: CanvasNode[],
    edges: CanvasEdge[],
    description: string,
    title?: string,
  ) => void;
  clearDocument: () => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  setActiveDrawer: (drawer: ActiveDrawerType) => void;
  setSelectedNodeId: (nodeId: string | null) => void;
  setEditingNodeId: (nodeId: string | null) => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export type MindMapStore = MindMapState & MindMapActions;

const INITIAL_STATE: MindMapState = {
  documentId: null,
  meta: null,
  nodes: [],
  edges: [],
  selectedNodeId: null,
  editingNodeId: null,
  history: [],
  historyIndex: -1,
  isLayoutRunning: false,
  activeDrawer: null,
  layoutOptions: { horizontalSpacing: 300, verticalSpacing: 24, direction: "HORIZONTAL" },
  isHydrating: false,
  loadError: null,
  saveStatus: "idle",
};

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                   */
/* -------------------------------------------------------------------------- */

/** Turns any thrown value into a sentence that is safe to show to a user. */
export function describeRepositoryError(error: unknown): string {
  if (error instanceof DocumentRepositoryError) {
    switch (error.code) {
      case "unavailable":
        return "Local storage is unavailable, so this map cannot be opened or saved.";
      case "corrupt_record":
        return "This map was written by an incompatible version and cannot be opened.";
      case "not_found":
        return "This map no longer exists.";
      case "write_failed":
        return "The map could not be saved. The browser may be out of storage.";
      case "invalid_input":
        return "The map data did not pass validation and was rejected before saving.";
      default:
        return error.message;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "An unexpected error occurred.";
}

/** Flags nodes hidden by the current collapse state, and their edges. */
function withCollapsedVisibility(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const hiddenNodeIds = collectHiddenNodeIds(nodes, edges);
  return {
    nodes: nodes.map((node) => {
      const hidden = hiddenNodeIds.has(node.id);
      return node.hidden === hidden ? node : { ...node, hidden };
    }),
    // An edge is invisible as soon as either endpoint is hidden.
    edges: edges.map((edge) => {
      const hidden = hiddenNodeIds.has(edge.source) || hiddenNodeIds.has(edge.target);
      return edge.hidden === hidden ? edge : { ...edge, hidden };
    }),
  };
}

/** Children of a parent, ordered by their `order` field. */
function getOrderedChildren(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  parentId: string,
): CanvasNode[] {
  return sortSiblingsByOrder(buildChildIndex(nodes, edges).get(parentId) ?? []);
}

/** The side a new child should be attached to. */
function resolveNewChildDirection(
  parent: CanvasNode,
  siblings: CanvasNode[],
  requested?: NodeDirection,
): NodeDirection {
  if (requested) {
    return requested;
  }
  if (parent.data.direction === "LEFT" || parent.data.direction === "RIGHT") {
    // Deeper generations stay on the side of the branch they belong to.
    return parent.data.direction;
  }
  const lastSibling = siblings[siblings.length - 1];
  if (!lastSibling) {
    return "RIGHT";
  }
  // Alternate so both sides of the root grow instead of a single branch.
  return lastSibling.data.direction === "LEFT" ? "RIGHT" : "LEFT";
}

/* -------------------------------------------------------------------------- */
/*                                    Store                                    */
/* -------------------------------------------------------------------------- */

export const useMindMapStore = create<MindMapStore>()((set, get) => {
  /**
   * Writes a node/edge pair into the store.
   *
   * @param reindex When false the derived fields are left alone, which matters
   *                on hot paths such as dragging: re-deriving `childCount` and
   *                the collapse flags on every pointer move is pure waste,
   *                because neither can change while a node is only moving.
   */
  const commit = (
    nodes: CanvasNode[],
    edges: CanvasEdge[],
    reindex: boolean,
  ): void => {
    const withDerived = reindex ? reindexNodeMetadata(nodes, edges) : nodes;
    const visible = withCollapsedVisibility(withDerived, edges);
    set({ nodes: visible.nodes, edges: visible.edges });
  };

  /** The tail every domain mutation shares: snapshot, then save. */
  const persist = (description: string): void => {
    get().pushHistorySnapshot(description);
    get().scheduleSave();
  };

  /**
   * Assembles the payload handed to the repository.
   *
   * `nodeCount` and `updatedAt` are derived here rather than trusted from the
   * in-memory metadata, which the dashboard reads: a stale count in the
   * document record would otherwise survive every save.
   */
  const buildPayload = (): MindMapExportPayload | null => {
    const { meta, nodes, edges } = get();
    if (!meta) {
      return null;
    }
    return {
      version: MINDMAP_SCHEMA_VERSION,
      meta: { ...meta, nodeCount: nodes.length, updatedAt: Date.now() },
      nodes,
      edges,
    };
  };

  /** Patches one node's data and records the change. */
  const patchNodeData = (
    id: string,
    update: (data: CanvasNode['data']) => CanvasNode['data'],
    description: string,
  ): void => {
    const { nodes, edges } = get();
    if (!nodes.some((node) => node.id === id)) {
      return;
    }
    commit(
      nodes.map((node) => (node.id === id ? { ...node, data: update(node.data) } : node)),
      edges,
      true,
    );
    persist(description);
  };

  return {
    ...INITIAL_STATE,

    /* ------------------------------------------------------------- loading */

    loadDocument: async (documentId) => {
      set({ isHydrating: true, loadError: null });

      try {
        const record = await getDocument(documentId);

        if (!record) {
          // A fresh route id becomes the document id, so reloading the same URL
          // opens that map instead of creating a second one.
          const createdId = await createDocument(UNNAMED_DOCUMENT_TITLE, { id: documentId });
          const created = await getDocument(createdId);
          if (!created) {
            throw new DocumentRepositoryError(
              'write_failed',
              'The new map could not be read back after it was created.',
            );
          }
          hydrate(set, get, created.data.meta, created.data.nodes, created.data.edges);
          return;
        }

        hydrate(set, get, record.data.meta, record.data.nodes, record.data.edges);
      } catch (error) {
        set({ loadError: describeRepositoryError(error) });
      } finally {
        set({ isHydrating: false });
      }
    },

    clearDocument: () => {
      cancelPendingSave();
      set({ ...INITIAL_STATE, isHydrating: false });
    },

    /* ------------------------------------------------------ flow handlers */

    onNodesChange: (changes) => {
      if (changes.length === 0) {
        return;
      }
      const { nodes, edges } = get();

      // Removals are a domain decision, not a visual one: they have to take a
      // whole subtree with them, so they are routed through `deleteSubtree`.
      const removals = changes.filter((change) => change.type === 'remove');
      if (removals.length > 0) {
        for (const change of removals) {
          get().deleteSubtree(change.id);
        }
      }

      const otherChanges = changes.filter((change) => change.type !== 'remove');
      if (otherChanges.length === 0) {
        return;
      }

      const dragCommitted = otherChanges.some(
        (change) => change.type === 'position' && change.dragging === false,
      );

      commit(applyNodeChanges<CanvasNode>(otherChanges, nodes), edges, false);

      if (dragCommitted) {
        // A finished drag is a meaningful step; the intermediate position
        // changes deliberately are not.
        get().pushHistorySnapshot('Move Node');
      }
      get().scheduleSave();
    },

    onEdgesChange: (changes) => {
      if (changes.length === 0) {
        return;
      }
      const { nodes, edges } = get();
      const nextEdges = applyEdgeChanges<CanvasEdge>(changes, edges);

      const hasRemoval = changes.some((change) => change.type === 'remove');
      if (hasRemoval) {
        // A branch edge is the only parent link, so removing it orphans the
        // child. The orphan is dropped to keep the map a single tree.
        const stillParented = new Set(nextEdges.map((edge) => edge.target));
        const survivors = nodes.filter(
          (node) =>
            node.data.depth === 0 ||
            node.data.parentId === null ||
            stillParented.has(node.id),
        );
        commit(survivors, nextEdges, true);
        persist('Delete Branch');
        return;
      }

      commit(nodes, nextEdges, false);
      get().scheduleSave();
    },

    onConnect: (connection) => {
      const { nodes, edges } = get();
      const { source, target } = connection;
      if (!source || !target || source === target) {
        return;
      }

      const parent = nodes.find((node) => node.id === source);
      const child = nodes.find((node) => node.id === target);
      if (!parent || !child) {
        return;
      }
      // The root is never attached to anything, and a node may not be moved
      // underneath its own subtree: the target's descendants are exactly the
      // nodes that would gain a second path to the source.
      if (child.data.depth === 0 || collectDescendants(target, edges).includes(source)) {
        return;
      }

      const depth = calculateNodeDepth(source, nodes, edges) + 1;
      const siblings = getOrderedChildren(nodes, edges, source).filter(
        (sibling) => sibling.id !== target,
      );
      const direction = resolveNewChildDirection(parent, siblings, child.data.direction);

      const nextEdges = [
        // One parent per node: drop whichever link the child had before.
        ...edges.filter((edge) => edge.target !== target),
        createBranchEdge({
          source,
          target,
          depth,
          branchColor: resolveBranchColor(depth),
        }),
      ];

      const nextNodes = nodes.map((node) =>
        node.id === target
          ? {
              ...node,
              type: 'branch' as const,
              data: {
                ...node.data,
                parentId: source,
                depth,
                direction,
                order: calculateNodeOrder(siblings),
                updatedAt: Date.now(),
              },
            }
          : node,
      );

      commit(nextNodes, nextEdges, true);
      set({ selectedNodeId: target });
      persist('Connect Branch');
    },

    /* ----------------------------------------------------------- snapshots */

    pushHistorySnapshot: (description) => {
      const { history, historyIndex, nodes, edges } = get();
      // Everything after the cursor is a redo branch and is discarded.
      const truncated = history.slice(0, historyIndex + 1);
      const nextEntry: HistoryEntry = {
        nodes: structuredClone(nodes),
        edges: structuredClone(edges),
        description,
        timestamp: Date.now(),
      };
      const nextHistory =
        truncated.length >= MAX_HISTORY_ENTRIES
          ? [...truncated.slice(truncated.length - MAX_HISTORY_ENTRIES + 1), nextEntry]
          : [...truncated, nextEntry];

      set({ history: nextHistory, historyIndex: nextHistory.length - 1 });
    },

    canUndo: () => get().historyIndex > 0,
    canRedo: () => get().historyIndex < get().history.length - 1,

    /* --------------------------------------------------------- persistence */

    scheduleSave: () => {
      const payload = buildPayload();
      if (!payload) {
        return;
      }
      set({ saveStatus: 'dirty' });
      scheduleDebouncedSave(payload, SAVE_DEBOUNCE_MS);
    },

    flushSave: async () => {
      const payload = buildPayload();
      if (!payload) {
        return;
      }
      set({ saveStatus: 'saving' });
      try {
        await flushImmediateSave(payload);
        set({ saveStatus: 'saved' });
      } catch (error) {
        set({ saveStatus: 'error', loadError: describeRepositoryError(error) });
      }
    },

    /* ------------------------------------------------------------ mutations */

    addNode: (parentId, direction) => {
      const { nodes, edges } = get();
      const parent = nodes.find((node) => node.id === parentId);
      if (!parent) {
        return;
      }

      const siblings = getOrderedChildren(nodes, edges, parentId);
      const child = createChildNode({
        parentId,
        depth: parent.data.depth + 1,
        order: calculateNodeOrder(siblings),
        direction: resolveNewChildDirection(parent, siblings, direction),
      });

      // A collapsed parent has to expand, otherwise the new node is invisible.
      const withParentExpanded = nodes.map((node) =>
        node.id === parentId && node.data.isCollapsed === true
          ? { ...node, data: { ...node.data, isCollapsed: false } }
          : node,
      );

      commit(
        [...withParentExpanded, child],
        [
          ...edges,
          createBranchEdge({ source: parentId, target: child.id, depth: child.data.depth }),
        ],
        true,
      );
      set({ selectedNodeId: child.id });
      persist('Add Node');
    },

    addSibling: (nodeId) => {
      const { nodes, edges } = get();
      const node = nodes.find((candidate) => candidate.id === nodeId);
      if (!node || node.data.depth === 0 || !node.data.parentId) {
        return;
      }
      const parent = nodes.find((candidate) => candidate.id === node.data.parentId);
      if (!parent) {
        return;
      }

      const siblings = getOrderedChildren(nodes, edges, parent.id);
      const sibling = createChildNode({
        parentId: parent.id,
        depth: parent.data.depth + 1,
        order: calculateNodeOrder(siblings),
        direction: node.data.direction === 'LEFT' ? 'RIGHT' : 'LEFT',
      });

      commit(
        [...nodes, sibling],
        [
          ...edges,
          createBranchEdge({ source: parent.id, target: sibling.id, depth: sibling.data.depth }),
        ],
        true,
      );
      set({ selectedNodeId: sibling.id });
      persist('Add Sibling');
    },

    updateNodeLabel: (id, label) => {
      const { nodes } = get();
      const trimmed = label.trim();
      const node = nodes.find((candidate) => candidate.id === id);
      if (!node || trimmed.length === 0 || trimmed === node.data.label) {
        // An empty label would render an invisible, ungrabbable node, so the
        // previous text is kept instead.
        return;
      }
      patchNodeData(id, (data) => ({ ...data, label: trimmed, updatedAt: Date.now() }), 'Rename Node');
    },

    updateNodeNotes: (id, notes) => {
      patchNodeData(id, (data) => ({ ...data, notes }), 'Edit Notes');
    },

    updateNodeStatus: (id, status) => {
      patchNodeData(
        id,
        (data) => {
          const next = { ...data, updatedAt: Date.now() };
          if (status === undefined) {
            delete next.status;
          } else {
            next.status = status;
          }
          return next;
        },
        'Change Status',
      );
    },

    updateNodeStyle: (id, patch) => {
      patchNodeData(
        id,
        (data) => ({ ...data, style: { ...data.style, ...patch }, updatedAt: Date.now() }),
        'Restyle Node',
      );
    },

    updateNodeTags: (id, tags) => {
      const cleaned = [
        ...new Set(
          tags
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0)
            .slice(0, 12),
        ),
      ];
      patchNodeData(
        id,
        (data) => ({ ...data, tags: cleaned, updatedAt: Date.now() }),
        'Edit Tags',
      );
    },

    setNodeDirection: (id, direction) => {
      const { nodes, edges } = get();
      const node = nodes.find((candidate) => candidate.id === id);
      if (!node || node.data.depth === 0 || node.data.direction === direction) {
        return;
      }
      commit(
        nodes.map((candidate) =>
          candidate.id === id
            ? { ...candidate, data: { ...candidate.data, direction, updatedAt: Date.now() } }
            : candidate,
        ),
        edges,
        true,
      );
      persist('Change Branch Side');
    },

    deleteSubtree: (nodeId) => {
      const { nodes, edges } = get();
      const node = nodes.find((candidate) => candidate.id === nodeId);
      if (!node) {
        return;
      }

      // Root protection: without the origin there is nothing left to lay out.
      const root = findRootNode(nodes);
      if (nodeId === root?.id || node.data.depth === 0) {
        return;
      }

      const doomed = new Set<string>([nodeId, ...collectDescendants(nodeId, edges)]);
      commit(
        nodes.filter((candidate) => !doomed.has(candidate.id)),
        edges.filter((edge) => !doomed.has(edge.source) && !doomed.has(edge.target)),
        true,
      );
      set({ selectedNodeId: null });
      persist('Delete Node');
    },

    toggleSubtreeCollapse: (nodeId) => {
      const { nodes, edges } = get();
      const node = nodes.find((candidate) => candidate.id === nodeId);
      if (!node) {
        return;
      }
      // Derived from the graph rather than `data.childCount`: the count is
      // refreshed lazily, and a stale zero would make a real branch
      // uncollapsible.
      if (getOrderedChildren(nodes, edges, nodeId).length === 0) {
        return;
      }

      const isCollapsed = node.data.isCollapsed !== true;
      commit(
        nodes.map((candidate) =>
          candidate.id === nodeId
            ? { ...candidate, data: { ...candidate.data, isCollapsed, updatedAt: Date.now() } }
            : candidate,
        ),
        edges,
        true,
      );
      persist(isCollapsed ? 'Collapse Branch' : 'Expand Branch');
    },

    setAllSubtreesCollapsed: (collapsed) => {
      const { nodes, edges } = get();
      const branches = new Set<string>();
      for (const edge of edges) {
        if (edge.source !== edge.target) {
          branches.add(edge.source);
        }
      }

      const targets = new Set(
        nodes
          .filter(
            (node) => branches.has(node.id) && (node.data.isCollapsed === true) !== collapsed,
          )
          .map((node) => node.id),
      );
      if (targets.size === 0) {
        return;
      }

      commit(
        nodes.map((node) =>
          targets.has(node.id)
            ? { ...node, data: { ...node.data, isCollapsed: collapsed, updatedAt: Date.now() } }
            : node,
        ),
        edges,
        true,
      );
      persist(collapsed ? 'Collapse All Branches' : 'Expand All Branches');
    },

    /* --------------------------------------------------------------- layout */

    applyLayout: (options) => {
      const { nodes, edges, layoutOptions } = get();
      if (nodes.length === 0) {
        return;
      }

      const resolved: LayoutOptions = { ...layoutOptions, ...options };
      set({ isLayoutRunning: true, layoutOptions: resolved });

      try {
        const laidOut = calculateMindMapLayout(nodes, edges, resolved);
        // Cached measurements describe the previous geometry; keeping them
        // would fight the new coordinates for a frame and shrink the node.
        const cleared = laidOut.nodes.map((node) => {
          const { measured: _measured, width: _width, height: _height, ...rest } = node;
          return rest as CanvasNode;
        });
        commit(cleared, laidOut.edges, true);
        persist(resolved.direction === 'RADIAL' ? 'Apply Radial Layout' : 'Apply Horizontal Layout');
      } finally {
        set({ isLayoutRunning: false });
      }
    },

    /* ---------------------------------------------------------- meta edits */

    updateViewport: (viewport) => {
      const { meta } = get();
      if (!meta) {
        return;
      }
      set({ meta: { ...meta, viewport } });
      get().scheduleSave();
    },

    renameDocument: (title) => {
      const { meta } = get();
      if (!meta) {
        return;
      }
      const trimmed = title.trim().slice(0, 120);
      if (trimmed.length === 0 || trimmed === meta.title) {
        return;
      }
      set({ meta: { ...meta, title: trimmed } });
      // A title is typed slowly and rarely; it is written without the debounce
      // so the dashboard never shows a stale name.
      void get().flushSave();
    },

    updateDocumentDescription: (description) => {
      const { meta } = get();
      if (!meta) {
        return;
      }
      set({ meta: { ...meta, description: description.slice(0, 2000) } });
      get().scheduleSave();
    },

    replaceCanvas: (nextNodes, nextEdges, description, title) => {
      const { meta } = get();
      if (!meta) {
        return;
      }
      // Collapse state is not part of an imported payload, so every branch
      // starts expanded and any stale `hidden` flag is dropped.
      const expanded = nextNodes.map((node) => {
        const { hidden: _hidden, ...rest } = node;
        return { ...rest, data: { ...rest.data, isCollapsed: false } } as CanvasNode;
      });
      commit(expanded, nextEdges, true);
      set({
        meta: {
          ...meta,
          description,
          ...(title === undefined ? {} : { title: title.trim().slice(0, 120) || meta.title }),
        },
        selectedNodeId: null,
        editingNodeId: null,
      });
      persist('Import Map');
    },

    /* ---------------------------------------------------------------- undo */

    undo: async () => {
      const { historyIndex, history } = get();
      if (historyIndex <= 0) {
        return;
      }
      // Cancel first: a queued write for the state being undone would land
      // after the restore and resurrect it.
      cancelPendingSave();

      const nextIndex = historyIndex - 1;
      const targetState = history[nextIndex];
      set({
        nodes: targetState.nodes,
        edges: targetState.edges,
        historyIndex: nextIndex,
        selectedNodeId: null,
      });
      await get().flushSave();
    },

    redo: async () => {
      const { historyIndex, history } = get();
      if (historyIndex >= history.length - 1) {
        return;
      }
      cancelPendingSave();

      const nextIndex = historyIndex + 1;
      const targetState = history[nextIndex];
      set({
        nodes: targetState.nodes,
        edges: targetState.edges,
        historyIndex: nextIndex,
        selectedNodeId: null,
      });
      await get().flushSave();
    },

    /* ------------------------------------------------------------ ui state */

    setActiveDrawer: (drawer) => {
      set({ activeDrawer: drawer });
    },

    setSelectedNodeId: (nodeId) => {
      const { editingNodeId } = get();
      // Selecting a different node abandons the open editor: two inline inputs
      // on one canvas would fight over the keyboard.
      set({
        selectedNodeId: nodeId,
        editingNodeId: editingNodeId !== null && editingNodeId !== nodeId ? null : editingNodeId,
      });
    },

    setEditingNodeId: (nodeId) => {
      set({ editingNodeId: nodeId, selectedNodeId: nodeId ?? get().selectedNodeId });
    },
  };
});

/** Fills the store from a stored record and seeds the history cursor. */
function hydrate(
  set: (partial: Partial<MindMapState>) => void,
  get: () => MindMapStore,
  meta: MindMapDocument,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
): void {
  const repaired = reindexNodeMetadata(nodes, edges);
  const visible = withCollapsedVisibility(repaired, edges);
  set({
    documentId: meta.id,
    meta,
    nodes: visible.nodes,
    edges: visible.edges,
    history: [],
    historyIndex: -1,
    selectedNodeId: null,
    editingNodeId: null,
    activeDrawer: null,
    isLayoutRunning: false,
    loadError: null,
    saveStatus: 'idle',
  });
  // Snapshot #0 is the document as stored, so the first real mutation can be
  // undone back to the state the user opened.
  get().pushHistorySnapshot('Open Map');
}

installUnloadFlush();
