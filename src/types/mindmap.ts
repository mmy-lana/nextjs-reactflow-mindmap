/**
 * Core domain model for the mind mapping canvas.
 *
 * This module is intentionally dependency-light: it only imports structural
 * types from `@xyflow/react` so that every other layer of the application
 * (store, hooks, pure engines, persistence) can rely on a single source of
 * truth without creating import cycles.
 *
 * Nothing in this file may import from `@/store` or from any module that has
 * side effects: it is imported by pure engines that must stay testable.
 */

import type { Edge, Node, XYPosition } from '@xyflow/react';

/* -------------------------------------------------------------------------- */
/*                                   Aliases                                   */
/* -------------------------------------------------------------------------- */

/** Distance of a node from the root concept. The root node always sits at `0`. */
export type NodeDepth = number;

/** Side of the root concept a node branch is laid out on. */
export type NodeDirection = 'LEFT' | 'RIGHT' | 'CENTER';

/** Workflow state a user can attach to any node. */
export type NodeStatus = 'IDEA' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED';

/**
 * Exclusive union of the drawers that may be open at any point in time.
 * Keeping it as a single value (instead of two booleans) structurally prevents
 * both drawers from being open at once on narrow viewports.
 */
export type ActiveDrawerType = 'inspector' | 'outline' | null;

/** Visual shape applied to a node surface. */
export type NodeShape = 'rounded' | 'rectangle' | 'pill' | 'underline';

/** Font weight applied to the node label. */
export type NodeFontWeight = 'normal' | 'medium' | 'semibold' | 'bold';

/** Discriminator of the three custom node components registered on the canvas. */
export type MindMapNodeType = 'root' | 'branch' | 'leaf';

/** Strategy used by the pure layout engine. */
export type LayoutDirection = 'HORIZONTAL' | 'RADIAL';

/** Side a branch occupies, excluding the root's `CENTER` direction. */
export type BranchSide = Extract<NodeDirection, 'LEFT' | 'RIGHT'>;

/* -------------------------------------------------------------------------- */
/*                                  Structures                                 */
/* -------------------------------------------------------------------------- */

/** Fully resolved visual configuration of a single node. */
export interface NodeStyleConfig {
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  textColor: string;
  fontSize: number;
  fontWeight: NodeFontWeight;
  shape: NodeShape;
}

/** Per-branch presentation carried by an organic edge. */
export interface MindMapEdgeData extends Record<string, unknown> {
  branchColor?: string;
  strokeWidth?: number;
  dashed?: boolean;
  label?: string;
  /**
   * Generation index of the child the edge points at, `1` or deeper.
   *
   * Kept on the edge so the renderer can taper the stroke without having to
   * look the node up again for every frame of a pan or zoom.
   */
  depth?: NodeDepth;
}

/** Data contract of every node rendered on the canvas. */
export interface MindMapNodeData extends Record<string, unknown> {
  /** Human readable node title, edited inline. */
  label: string;
  /** Free-form notes edited inside the inspector drawer. */
  notes?: string;
  /** Generation index, `0` for the root node. */
  depth: NodeDepth;
  /** Side of the root this node (or its subtree) is attached to. */
  direction: NodeDirection;
  /** Sibling index, ascending, used to stack branches deterministically. */
  order: number;
  /** Optional workflow state. */
  status?: NodeStatus;
  /** When `true` the direct children are hidden until the node is expanded. */
  isCollapsed?: boolean;
  /** Number of direct children, derived from the edge set. */
  childCount: number;
  /** Free-form labels used for filtering. */
  tags: string[];
  /** Resolved visual configuration. */
  style: NodeStyleConfig;
  /** Id of the parent node, `null` for the root and for orphans. */
  parentId?: string | null;
  createdAt: number;
  updatedAt: number;
}

/** A node as consumed by `@xyflow/react`. */
export type CanvasNode = Node<MindMapNodeData, MindMapNodeType>;

/** An edge as consumed by `@xyflow/react`. */
export type CanvasEdge = Edge<MindMapEdgeData, 'organic'>;

/** Pan/zoom state persisted alongside a document. */
export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

/** Document level metadata, stored as a record in IndexedDB. */
export interface MindMapDocument {
  id: string;
  title: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  nodeCount: number;
  viewport: ViewportState;
  tags: string[];
}

/** Portable, self contained serialization of a whole mind map. */
export interface MindMapExportPayload {
  /** Schema version, see {@link MINDMAP_SCHEMA_VERSION}. */
  version: string;
  meta: MindMapDocument;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

/** Tunables of the pure layout engine. */
export interface LayoutOptions {
  /** Horizontal gap between two consecutive generations. */
  horizontalSpacing: number;
  /** Vertical gap between two sibling subtree blocks. */
  verticalSpacing: number;
  direction: LayoutDirection;
}

/** One undo/redo checkpoint. */
export interface HistoryEntry {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  description: string;
  timestamp: number;
}

/* -------------------------------------------------------------------------- */
/*                                  Constants                                  */
/* -------------------------------------------------------------------------- */

/** Style applied to every generated node unless the user overrides it. */
export const DEFAULT_NODE_STYLE: Readonly<NodeStyleConfig> = {
  backgroundColor: '#15171a',
  borderColor: '#282c34',
  borderWidth: 1,
  textColor: '#f3f4f6',
  fontSize: 14,
  fontWeight: 'medium',
  shape: 'rounded',
};

/**
 * Style of the root concept. The root is the only node that is visually
 * promoted, so it ships its own configuration instead of layering overrides
 * on top of {@link DEFAULT_NODE_STYLE}.
 */
export const ROOT_NODE_STYLE: Readonly<NodeStyleConfig> = {
  backgroundColor: '#15171a',
  borderColor: '#6366f1',
  borderWidth: 2,
  textColor: '#f3f4f6',
  fontSize: 16,
  fontWeight: 'bold',
  shape: 'rounded',
};

/** Edge data applied to every freshly created branch. */
export const DEFAULT_EDGE_DATA: Readonly<MindMapEdgeData> = {
  branchColor: '#6366f1',
  strokeWidth: 2,
  dashed: false,
};

/** Label shown when a document or a node has no meaningful name. */
export const UNNAMED_DOCUMENT_TITLE = 'Untitled Mind Map';

/** Label used for newly created child nodes before the user renames them. */
export const UNNAMED_NODE_LABEL = 'New Idea';

/**
 * Schema version written into every export payload. Bump it whenever the
 * persisted shape changes in a way that older clients cannot read.
 */
export const MINDMAP_SCHEMA_VERSION = '1.0.0';

/** Circular ceiling of the undo/redo stack. */
export const MAX_HISTORY_ENTRIES = 50;

/** Debounce window applied to persistence writes triggered by edits. */
export const SAVE_DEBOUNCE_MS = 400;

/** Fallback node footprint used before `@xyflow/react` reports measurements. */
export const DEFAULT_NODE_SIZE = {
  width: 200,
  height: 44,
} as const;

/** Minimum free space kept between two node surfaces, in pixels. */
export const MIN_NODE_GAP = 40;

/** Layout settings applied when the caller does not provide any. */
export const DEFAULT_LAYOUT_OPTIONS: Readonly<Required<LayoutOptions>> = {
  horizontalSpacing: 300,
  verticalSpacing: 24,
  direction: 'HORIZONTAL',
};

/**
 * Handle ids shared between the node components (Phase 3) and the pure
 * layout engine (Phase 1). Edges are wired to these ids by the layout engine,
 * so both sides must use the exact same literal values.
 */
export const NODE_HANDLE_IDS = {
  LEFT_SOURCE: 'left-source',
  RIGHT_SOURCE: 'right-source',
  LEFT_TARGET: 'left-target',
  RIGHT_TARGET: 'right-target',
  TOP_SOURCE: 'top-source',
  BOTTOM_TARGET: 'bottom-target',
} as const;

export type NodeHandleId = (typeof NODE_HANDLE_IDS)[keyof typeof NODE_HANDLE_IDS];

/**
 * Branch colours indexed by depth. Depth `0` is unused (the root has no
 * incoming edge), which keeps `BRANCH_COLOR_PALETTE[depth]` a one-liner.
 */
export const BRANCH_COLOR_PALETTE: readonly string[] = [
  '#6366f1',
  '#6366f1',
  '#22d3ee',
  '#f472b6',
  '#facc15',
  '#34d399',
  '#fb923c',
];

/** Presentation metadata for every workflow status. */
export const NODE_STATUS_META: Readonly<
  Record<NodeStatus, { label: string; color: string; backgroundColor: string }>
> = {
  IDEA: { label: 'Idea', color: '#9ca3af', backgroundColor: 'rgba(156, 163, 175, 0.16)' },
  IN_PROGRESS: {
    label: 'In progress',
    color: '#facc15',
    backgroundColor: 'rgba(250, 204, 21, 0.16)',
  },
  COMPLETED: {
    label: 'Completed',
    color: '#34d399',
    backgroundColor: 'rgba(52, 211, 153, 0.16)',
  },
  BLOCKED: { label: 'Blocked', color: '#f87171', backgroundColor: 'rgba(248, 113, 113, 0.16)' },
};

/** Ordered list of statuses, used by the inspector dropdown. */
export const NODE_STATUS_ORDER: readonly NodeStatus[] = [
  'IDEA',
  'IN_PROGRESS',
  'COMPLETED',
  'BLOCKED',
];

/* -------------------------------------------------------------------------- */
/*                              Runtime type guards                            */
/* -------------------------------------------------------------------------- */

/** Narrows an unknown value to a {@link NodeDirection}. */
export function isNodeDirection(value: unknown): value is NodeDirection {
  return value === 'LEFT' || value === 'RIGHT' || value === 'CENTER';
}

/** Narrows an unknown value to a {@link BranchSide}. */
export function isBranchSide(value: unknown): value is BranchSide {
  return value === 'LEFT' || value === 'RIGHT';
}

/** Narrows an unknown value to a {@link NodeStatus}. */
export function isNodeStatus(value: unknown): value is NodeStatus {
  return (
    value === 'IDEA' ||
    value === 'IN_PROGRESS' ||
    value === 'COMPLETED' ||
    value === 'BLOCKED'
  );
}

/** Narrows an unknown value to a {@link MindMapNodeType}. */
export function isMindMapNodeType(value: unknown): value is MindMapNodeType {
  return value === 'root' || value === 'branch' || value === 'leaf';
}

/** Narrows an unknown value to a {@link NodeShape}. */
export function isNodeShape(value: unknown): value is NodeShape {
  return (
    value === 'rounded' ||
    value === 'rectangle' ||
    value === 'pill' ||
    value === 'underline'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isPosition(value: unknown): value is XYPosition {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

/** Narrows an unknown value to a {@link NodeFontWeight}. */
export function isNodeFontWeight(value: unknown): value is NodeFontWeight {
  return value === 'normal' || value === 'medium' || value === 'semibold' || value === 'bold';
}

/** Validates the nested visual configuration of a node. */
export function isNodeStyleConfig(value: unknown): value is NodeStyleConfig {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isNonEmptyString(value.backgroundColor) &&
    isNonEmptyString(value.borderColor) &&
    isFiniteNumber(value.borderWidth) &&
    isNonEmptyString(value.textColor) &&
    isFiniteNumber(value.fontSize) &&
    isNodeFontWeight(value.fontWeight) &&
    isNodeShape(value.shape)
  );
}

/** Validates the `data` payload of a canvas node. */
export function isMindMapNodeData(value: unknown): value is MindMapNodeData {
  if (!isRecord(value)) {
    return false;
  }
  const hasValidParentId =
    value.parentId === null || value.parentId === undefined || isNonEmptyString(value.parentId);

  return (
    typeof value.label === 'string' &&
    isFiniteNumber(value.depth) &&
    isNodeDirection(value.direction) &&
    isFiniteNumber(value.order) &&
    isFiniteNumber(value.childCount) &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => typeof tag === 'string') &&
    isNodeStyleConfig(value.style) &&
    hasValidParentId &&
    isFiniteNumber(value.createdAt) &&
    isFiniteNumber(value.updatedAt) &&
    (value.status === undefined || isNodeStatus(value.status)) &&
    (value.isCollapsed === undefined || typeof value.isCollapsed === 'boolean') &&
    (value.notes === undefined || typeof value.notes === 'string')
  );
}

/**
 * Validates a node read back from IndexedDB or from an imported JSON file.
 * Top level `@xyflow/react` fields (position, selection, visibility) are
 * checked loosely because the engine re-seeds the ones it owns.
 */
export function isCanvasNode(value: unknown): value is CanvasNode {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isNonEmptyString(value.id) &&
    isPosition(value.position) &&
    isMindMapNodeData(value.data) &&
    (value.type === undefined || isMindMapNodeType(value.type))
  );
}

/** Validates an edge read back from IndexedDB or from an imported JSON file. */
export function isCanvasEdge(value: unknown): value is CanvasEdge {
  if (!isRecord(value)) {
    return false;
  }
  if (!isNonEmptyString(value.id) || !isNonEmptyString(value.source) || !isNonEmptyString(value.target)) {
    return false;
  }
  if (value.data !== undefined && !isRecord(value.data)) {
    return false;
  }
  return value.type === undefined || value.type === 'organic';
}

/**
 * Validates document level metadata.
 *
 * The name is deliberately scoped to the `meta` object: a full document is
 * `{ version, meta, nodes, edges }` and is validated by
 * {@link isMindMapExportPayload}.
 */
export function isDocumentMeta(value: unknown): value is MindMapDocument {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isNonEmptyString(value.id) &&
    typeof value.title === 'string' &&
    typeof value.description === 'string' &&
    isFiniteNumber(value.createdAt) &&
    isFiniteNumber(value.updatedAt) &&
    isFiniteNumber(value.nodeCount) &&
    Array.isArray(value.tags) &&
    value.tags.every((tag) => typeof tag === 'string') &&
    isRecord(value.viewport) &&
    isFiniteNumber(value.viewport.x) &&
    isFiniteNumber(value.viewport.y) &&
    isFiniteNumber(value.viewport.zoom)
  );
}

/**
 * Verifies that a node collection owns exactly one root.
 *
 * The editor positions the whole map around the root, so a document without
 * one cannot be rendered and must never reach the store or an import.
 */
export function containsSingleRootNode(nodes: readonly unknown[]): boolean {
  let roots = 0;
  for (const node of nodes) {
    if (!isRecord(node) || !isMindMapNodeData(node.data)) {
      return false;
    }
    if (node.type === 'root' || node.data.depth === 0) {
      roots += 1;
      if (roots > 1) {
        return false;
      }
    }
  }
  return roots === 1;
}

/**
 * Validates a full export payload. Used before importing a user supplied
 * JSON file so a malformed document can never reach the store.
 */
export function isMindMapExportPayload(value: unknown): value is MindMapExportPayload {
  if (!isRecord(value)) {
    return false;
  }
  return (
    isNonEmptyString(value.version) &&
    isDocumentMeta(value.meta) &&
    Array.isArray(value.nodes) &&
    value.nodes.every(isCanvasNode) &&
    containsSingleRootNode(value.nodes) &&
    Array.isArray(value.edges) &&
    value.edges.every(isCanvasEdge)
  );
}
