/**
 * Pure factories for canvas nodes and edges.
 *
 * Every node that enters the application is built here, which guarantees that
 * timestamps, identifiers, style defaults and handle wiring stay consistent
 * across the persistence layer (new documents) and the store (edits).
 *
 * The module has no side effects and imports nothing from the store.
 */

import {
  BRANCH_COLOR_PALETTE,
  DEFAULT_EDGE_DATA,
  DEFAULT_NODE_STYLE,
  ROOT_NODE_STYLE,
  UNNAMED_NODE_LABEL,
  type CanvasEdge,
  type CanvasNode,
  type MindMapNodeData,
  type MindMapNodeType,
  type NodeDepth,
  type NodeDirection,
  type NodeStatus,
  type NodeStyleConfig,
} from '@/types/mindmap';

/**
 * Creates a RFC 4122 v4 identifier.
 *
 * `crypto.randomUUID` is only exposed in secure contexts, and this application
 * is explicitly meant to be opened from a phone on a plain HTTP LAN address,
 * where the API is missing. The fallback below keeps identifiers unique (and
 * therefore safe for the import remapping of the export engine) everywhere.
 */
export function createUuid(): string {
  const cryptoRef: Crypto | undefined = typeof globalThis.crypto === 'undefined' ? undefined : globalThis.crypto;

  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return cryptoRef.randomUUID();
  }

  if (cryptoRef && typeof cryptoRef.getRandomValues === 'function') {
    const bytes = cryptoRef.getRandomValues(new Uint8Array(16));
    // Version 4, variant 10xx.
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  throw new Error(
    'A secure random source is required to create mind map identifiers. Serve the application over HTTPS or localhost.',
  );
}

/** Branch colour for a given depth, cycling through the palette. */
export function resolveBranchColor(depth: NodeDepth): string {
  if (!Number.isFinite(depth) || depth <= 0) {
    return DEFAULT_EDGE_DATA.branchColor ?? BRANCH_COLOR_PALETTE[1] ?? '#6366f1';
  }
  const index = Math.min(Math.floor(depth), BRANCH_COLOR_PALETTE.length - 1);
  return BRANCH_COLOR_PALETTE[index] ?? '#6366f1';
}

/** Chooses the node component that should render a given node. */
export function resolveNodeType(depth: NodeDepth, childCount: number): MindMapNodeType {
  if (depth <= 0) {
    return 'root';
  }
  return childCount > 0 ? 'branch' : 'leaf';
}

/** Deeply copies a style config so callers can never mutate the defaults. */
function cloneStyle(style: Readonly<NodeStyleConfig>): NodeStyleConfig {
  return { ...style };
}

/** Options accepted when building a node. */
export interface CreateMindMapNodeOptions {
  /** Stable identifier, generated when omitted. */
  id?: string;
  label?: string;
  depth?: NodeDepth;
  direction?: NodeDirection;
  order?: number;
  parentId?: string | null;
  childCount?: number;
  status?: NodeStatus;
  notes?: string;
  isCollapsed?: boolean;
  tags?: string[];
  style?: Readonly<Partial<NodeStyleConfig>>;
  /** Explicit creation timestamp, defaults to `Date.now()`. */
  createdAt?: number;
  /** Explicit update timestamp, defaults to `createdAt`. */
  updatedAt?: number;
  /** Overrides the component selected from depth/child count. */
  type?: MindMapNodeType;
}

/**
 * Builds a fully populated canvas node. The returned object is safe to hand to
 * the store, the layout engine and the persistence layer as-is.
 */
export function createMindMapNode(options: CreateMindMapNodeOptions = {}): CanvasNode {
  const depth = Math.max(0, Math.trunc(options.depth ?? 0));
  const childCount = Math.max(0, Math.trunc(options.childCount ?? 0));
  const createdAt = options.createdAt ?? Date.now();
  const style = cloneStyle({
    ...(depth === 0 ? ROOT_NODE_STYLE : DEFAULT_NODE_STYLE),
    ...options.style,
  });

  const data: MindMapNodeData = {
    label: options.label ?? (depth === 0 ? 'Central Concept' : UNNAMED_NODE_LABEL),
    depth,
    direction: options.direction ?? 'CENTER',
    order: Math.trunc(options.order ?? 0),
    childCount,
    tags: options.tags ? [...options.tags] : [],
    style,
    parentId: options.parentId ?? null,
    createdAt,
    updatedAt: options.updatedAt ?? createdAt,
  };

  if (options.notes !== undefined) {
    data.notes = options.notes;
  }
  if (options.status !== undefined) {
    data.status = options.status;
  }
  if (options.isCollapsed !== undefined) {
    data.isCollapsed = options.isCollapsed;
  }

  return {
    id: options.id ?? createUuid(),
    type: options.type ?? resolveNodeType(depth, childCount),
    position: { x: 0, y: 0 },
    data,
  };
}

/** Builds the root concept of a brand new document. */
export function createRootNode(options: CreateMindMapNodeOptions = {}): CanvasNode {
  return createMindMapNode({
    ...options,
    depth: 0,
    direction: 'CENTER',
    order: 0,
    parentId: null,
    type: 'root',
  });
}

/** Arguments required to append a node under an existing parent. */
export interface CreateChildNodeParams {
  /** Stable identifier, generated when omitted. */
  id?: string;
  parentId: string;
  /** Generation of the new node, i.e. `parentDepth + 1`. */
  depth: NodeDepth;
  /** Sibling slot the new node occupies. */
  order: number;
  /** Side the subtree is attached to. */
  direction: NodeDirection;
  label?: string;
  status?: NodeStatus;
  notes?: string;
  tags?: string[];
  createdAt?: number;
  updatedAt?: number;
}

/** Builds a child node wired to an existing parent. */
export function createChildNode(params: CreateChildNodeParams): CanvasNode {
  return createMindMapNode({
    id: params.id,
    depth: params.depth,
    direction: params.direction,
    order: params.order,
    parentId: params.parentId,
    label: params.label,
    status: params.status,
    notes: params.notes,
    tags: params.tags,
    createdAt: params.createdAt,
    updatedAt: params.updatedAt,
  });
}

/** Arguments required to build the edge that links a child to its parent. */
export interface CreateBranchEdgeParams {
  source: string;
  target: string;
  depth: NodeDepth;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  branchColor?: string;
  label?: string;
}

/** Builds an organic edge carrying the default branch presentation. */
export function createBranchEdge(params: CreateBranchEdgeParams): CanvasEdge {
  const edge: CanvasEdge = {
    id: createUuid(),
    source: params.source,
    target: params.target,
    sourceHandle: params.sourceHandle ?? null,
    targetHandle: params.targetHandle ?? null,
    type: 'organic',
    data: {
      ...DEFAULT_EDGE_DATA,
      branchColor: params.branchColor ?? resolveBranchColor(params.depth),
    },
  };

  if (params.label !== undefined) {
    edge.data = { ...edge.data, label: params.label };
  }

  return edge;
}
