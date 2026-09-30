/**
 * Pure layout engine.
 *
 * Architectural rule: this module imports **structural types only**. It never
 * touches the Zustand store, the database or the DOM, which makes the layout
 * reproducible and testable in isolation.
 *
 * Two strategies are implemented:
 *
 * - `HORIZONTAL`: a classic two sided mind map. The root concept is centred on
 *   the canvas origin, first generation branches pick a side and every subtree
 *   is stacked vertically, centred against its parent.
 * - `RADIAL`: a polar tree. The root sits at the centre and each subtree owns
 *   an angular wedge proportional to its number of leaves.
 *
 * Spacing semantics:
 * - `horizontalSpacing` is the minimum centre-to-centre distance between two
 *   consecutive generations (clamped up when nodes are too wide to fit).
 * - `verticalSpacing` is the edge-to-edge gap between two sibling blocks, i.e.
 *   `Σ childHeights + verticalSpacing · (n - 1)`.
 *
 * Positions are React Flow positions, i.e. the **top-left corner** of a node.
 * The engine reasons about node *centres* internally and converts on output,
 * which is what keeps a map symmetric around the origin.
 */

import type { XYPosition } from '@xyflow/react';
import {
  DEFAULT_LAYOUT_OPTIONS,
  MIN_NODE_GAP,
  NODE_HANDLE_IDS,
  type BranchSide,
  type CanvasEdge,
  type CanvasNode,
  type LayoutOptions,
  type NodeHandleId,
} from '@/types/mindmap';
import { resolveBranchColor } from './nodeFactory';
import {
  buildAcyclicChildIndex,
  findRootNode,
  reindexNodeMetadata,
  resolveBranchSide,
  resolveNodeSize,
  sortSiblingsByOrder,
} from './treeTransforms';

/** Result of a layout pass: repositioned nodes and re-wired edges. */
export interface LayoutResult {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

/** Handle ids an edge must use for a given side and strategy. */
export interface EdgeHandleIds {
  sourceHandle: NodeHandleId;
  targetHandle: NodeHandleId;
}

/** Strategy accepted by the engine, aliased for readable signatures. */
type LayoutStrategy = LayoutOptions['direction'];

/** Internal centre-based geometry of a single node. */
interface NodeGeometry {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

interface NodeSize {
  width: number;
  height: number;
}

interface LayoutContext {
  rootNode: CanvasNode;
  childIndex: Map<string, CanvasNode[]>;
  sizes: Map<string, NodeSize>;
  geometry: Map<string, NodeGeometry>;
  sides: Map<string, BranchSide>;
  settings: Required<LayoutOptions>;
}

/** Deepest generation laid out by the radial strategy, a corruption backstop. */
const MAX_RADIAL_DEPTH = 32;

/**
 * Returns the handle pair an edge must use.
 *
 * Horizontal layouts wire branches to the left/right handles, radial layouts
 * use the top/bottom pair so the generated bezier curves stay readable when
 * children are placed around their parent.
 */
export function resolveEdgeHandleIds(
  side: BranchSide,
  strategy: LayoutStrategy,
): EdgeHandleIds {
  if (strategy === 'RADIAL') {
    return {
      sourceHandle: NODE_HANDLE_IDS.TOP_SOURCE,
      targetHandle: NODE_HANDLE_IDS.BOTTOM_TARGET,
    };
  }
  return side === 'LEFT'
    ? { sourceHandle: NODE_HANDLE_IDS.LEFT_SOURCE, targetHandle: NODE_HANDLE_IDS.LEFT_TARGET }
    : { sourceHandle: NODE_HANDLE_IDS.RIGHT_SOURCE, targetHandle: NODE_HANDLE_IDS.RIGHT_TARGET };
}

/** Merges caller options with the defaults and discards invalid values. */
function sanitizeOptions(options: Partial<LayoutOptions> | undefined): Required<LayoutOptions> {
  const merged: LayoutOptions = { ...DEFAULT_LAYOUT_OPTIONS, ...(options ?? {}) };

  const horizontalSpacing =
    typeof merged.horizontalSpacing === 'number' &&
    Number.isFinite(merged.horizontalSpacing) &&
    merged.horizontalSpacing > 0
      ? merged.horizontalSpacing
      : DEFAULT_LAYOUT_OPTIONS.horizontalSpacing;

  const verticalSpacing =
    typeof merged.verticalSpacing === 'number' &&
    Number.isFinite(merged.verticalSpacing) &&
    merged.verticalSpacing >= 0
      ? merged.verticalSpacing
      : DEFAULT_LAYOUT_OPTIONS.verticalSpacing;

  const direction: LayoutStrategy =
    merged.direction === 'RADIAL' || merged.direction === 'HORIZONTAL'
      ? merged.direction
      : DEFAULT_LAYOUT_OPTIONS.direction;

  return { horizontalSpacing, verticalSpacing, direction };
}

function toTopLeft(geometry: NodeGeometry): XYPosition {
  return {
    x: geometry.centerX - geometry.width / 2,
    y: geometry.centerY - geometry.height / 2,
  };
}

function childrenOf(context: LayoutContext, nodeId: string): CanvasNode[] {
  return sortSiblingsByOrder(context.childIndex.get(nodeId) ?? []);
}

function sizeOf(context: LayoutContext, nodeId: string): NodeSize {
  return context.sizes.get(nodeId) ?? { width: 0, height: 0 };
}

/** Drops edges whose endpoints are missing from the node set or self referential. */
function filterResolvableEdges(
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
): CanvasEdge[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  return edges
    .filter(
      (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target) && edge.source !== edge.target,
    )
    .map((edge) => ({ ...edge }));
}

/**
 * Computes a fresh layout for the whole map.
 *
 * The inputs are never mutated. Nodes that cannot be reached (orphans of a
 * corrupted graph) keep the position they already had.
 *
 * @param nodes Current node snapshot.
 * @param edges Current edge snapshot.
 * @param options Spacing and strategy; partial options are merged with the
 *                defaults and validated.
 * @returns Repositioned nodes and edges with refreshed derived metadata.
 */
export function calculateMindMapLayout(
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
  options: Partial<LayoutOptions> = DEFAULT_LAYOUT_OPTIONS,
): LayoutResult {
  if (nodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  const settings = sanitizeOptions(options);
  const resolvableEdges = filterResolvableEdges(nodes, edges);
  const rootNode = findRootNode(nodes);

  if (!rootNode) {
    return { nodes: reindexNodeMetadata(nodes, resolvableEdges), edges: resolvableEdges };
  }

  const childIndex = buildAcyclicChildIndex(nodes, resolvableEdges);
  const sizes = new Map<string, NodeSize>();
  for (const node of nodes) {
    sizes.set(node.id, resolveNodeSize(node));
  }

  const context: LayoutContext = {
    rootNode,
    childIndex,
    sizes,
    geometry: new Map<string, NodeGeometry>(),
    sides: new Map<string, BranchSide>(),
    settings,
  };

  context.geometry.set(rootNode.id, { centerX: 0, centerY: 0, ...sizeOf(context, rootNode.id) });

  if (settings.direction === 'RADIAL') {
    layoutRadial(context);
  } else {
    layoutHorizontal(context);
  }

  const laidOutNodes = nodes.map((node) => {
    const nodeGeometry = context.geometry.get(node.id);
    return nodeGeometry ? { ...node, position: toTopLeft(nodeGeometry) } : node;
  });

  const synchronizedNodes = reindexNodeMetadata(laidOutNodes, resolvableEdges);

  return {
    nodes: synchronizedNodes,
    edges: wireEdges(synchronizedNodes, resolvableEdges, context.sides, settings.direction),
  };
}

/**
 * Height of the vertical block occupied by a subtree:
 * `max(nodeHeight, Σ childHeights + verticalSpacing · (n - 1))`.
 */
function computeSubtreeHeights(context: LayoutContext): Map<string, number> {
  const heights = new Map<string, number>();

  const measure = (nodeId: string): number => {
    const cached = heights.get(nodeId);
    if (cached !== undefined) {
      return cached;
    }

    const { height } = sizeOf(context, nodeId);
    const children = childrenOf(context, nodeId);

    if (children.length === 0) {
      heights.set(nodeId, height);
      return height;
    }

    // The child index is acyclic, so this recursion always terminates.
    const childrenHeight = children.reduce((sum, child) => sum + measure(child.id), 0);
    const stacked = childrenHeight + context.settings.verticalSpacing * (children.length - 1);
    const result = Math.max(height, stacked);
    heights.set(nodeId, result);
    return result;
  };

  for (const nodeId of context.sizes.keys()) {
    measure(nodeId);
  }

  return heights;
}

/** Centre-to-centre distance between two consecutive generations. */
function resolveStep(context: LayoutContext, parentId: string, childId: string): number {
  const parentSize = sizeOf(context, parentId);
  const childSize = sizeOf(context, childId);
  const minimumStep = parentSize.width / 2 + childSize.width / 2 + MIN_NODE_GAP;
  return Math.max(context.settings.horizontalSpacing, minimumStep);
}

/**
 * Stacks a list of children vertically and centres the resulting block on the
 * parent. `children` is passed explicitly so the caller can lay out the two
 * root sides independently.
 */
function placeHorizontalSubtree(
  context: LayoutContext,
  parentId: string,
  parentSide: BranchSide,
  children: CanvasNode[],
  heights: Map<string, number>,
): void {
  if (children.length === 0) {
    return;
  }

  const parentGeometry = context.geometry.get(parentId);
  if (!parentGeometry) {
    return;
  }

  const totalHeight =
    children.reduce(
      (sum, child) => sum + (heights.get(child.id) ?? sizeOf(context, child.id).height),
      0,
    ) + context.settings.verticalSpacing * (children.length - 1);

  let cursor = parentGeometry.centerY - totalHeight / 2;

  children.forEach((child, index) => {
    const childHeight = heights.get(child.id) ?? sizeOf(context, child.id).height;
    const step = resolveStep(context, parentId, child.id);
    // The side is resolved once, when the child is first reached, and then
    // reused: recomputing it here would override the parity fallback chosen for
    // the first generation with plain inheritance.
    const side = context.sides.get(child.id) ?? resolveBranchSide(child, parentSide, index);

    context.sides.set(child.id, side);
    context.geometry.set(child.id, {
      centerX: parentGeometry.centerX + (side === 'RIGHT' ? step : -step),
      centerY: cursor + childHeight / 2,
      ...sizeOf(context, child.id),
    });

    placeHorizontalSubtree(context, child.id, side, childrenOf(context, child.id), heights);
    cursor += childHeight + context.settings.verticalSpacing;
  });
}

function layoutHorizontal(context: LayoutContext): void {
  const heights = computeSubtreeHeights(context);
  const rootChildren = childrenOf(context, context.rootNode.id);
  const rightBranch: CanvasNode[] = [];
  const leftBranch: CanvasNode[] = [];

  rootChildren.forEach((child, index) => {
    // First generation nodes carrying the `CENTER` direction fall back to the
    // parity of their sibling slot: even slots go right, odd slots go left.
    const side = resolveBranchSide(child, 'CENTER', index);
    context.sides.set(child.id, side);
    (side === 'LEFT' ? leftBranch : rightBranch).push(child);
  });

  placeHorizontalSubtree(context, context.rootNode.id, 'RIGHT', rightBranch, heights);
  placeHorizontalSubtree(context, context.rootNode.id, 'LEFT', leftBranch, heights);
}

/** Memoised leaf counter, used to size the angular wedges of a radial map. */
function createLeafWeightCounter(context: LayoutContext): (nodeId: string) => number {
  const cache = new Map<string, number>();

  function weightOf(nodeId: string): number {
    const cached = cache.get(nodeId);
    if (cached !== undefined) {
      return cached;
    }

    // Seed the cache so a cycle can never recurse forever.
    cache.set(nodeId, 1);

    const children = childrenOf(context, nodeId);
    const weight =
      children.length === 0 ? 1 : children.reduce((sum, child) => sum + weightOf(child.id), 0);

    cache.set(nodeId, weight);
    return weight;
  }

  return weightOf;
}

function layoutRadial(context: LayoutContext): void {
  const rootChildren = childrenOf(context, context.rootNode.id);
  if (rootChildren.length === 0) {
    return;
  }

  const weightOf = createLeafWeightCounter(context);
  const totalWeight = rootChildren.reduce((sum, child) => sum + weightOf(child.id), 0) || 1;
  const fullTurn = Math.PI * 2;

  const placeSubtree = (
    node: CanvasNode,
    startAngle: number,
    endAngle: number,
    radius: number,
    depth: number,
  ): void => {
    const span = Math.max(endAngle - startAngle, 0);
    const midAngle = startAngle + span / 2;

    context.geometry.set(node.id, {
      centerX: radius * Math.cos(midAngle),
      centerY: radius * Math.sin(midAngle),
      ...sizeOf(context, node.id),
    });

    const children = childrenOf(context, node.id);
    if (children.length === 0 || depth >= MAX_RADIAL_DEPTH) {
      return;
    }

    const weights = children.map((child) => weightOf(child.id));
    const childrenWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;

    // Angular padding, derived from the arc length a child needs on this ring.
    const widestChild = Math.max(...children.map((child) => sizeOf(context, child.id).width), 0);
    const arcGap = widestChild * 0.35 + context.settings.verticalSpacing;
    const maxGap = (span / (children.length + 1)) * 0.9;
    const gap = Math.min(arcGap / Math.max(radius, 1), maxGap);
    const usable = Math.max(span - gap * (children.length + 1), span * 0.1);

    let cursor = startAngle + gap;
    children.forEach((child, index) => {
      const childSpan = usable * ((weights[index] ?? 1) / childrenWeight);
      placeSubtree(
        child,
        cursor,
        cursor + childSpan,
        radius + context.settings.horizontalSpacing,
        depth + 1,
      );
      cursor += childSpan + gap;
    });
  };

  // Start at the top so the first branch points straight up.
  let cursor = -Math.PI / 2;
  for (const child of rootChildren) {
    const share = (fullTurn * weightOf(child.id)) / totalWeight;
    placeSubtree(child, cursor, cursor + share, context.settings.horizontalSpacing, 1);
    cursor += share;
  }
}

/** Re-wires handles and refreshes the branch colour of every edge. */
function wireEdges(
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
  sides: Map<string, BranchSide>,
  strategy: LayoutStrategy,
): CanvasEdge[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return edges.map((edge) => {
    const child = nodeById.get(edge.target);
    const parent = nodeById.get(edge.source);
    const side: BranchSide =
      sides.get(edge.target) ?? (child?.data.direction === 'LEFT' ? 'LEFT' : 'RIGHT');
    const handles = resolveEdgeHandleIds(side, strategy);
    const depth = Math.max(child?.data.depth ?? parent?.data.depth ?? 1, 1);

    return {
      ...edge,
      type: 'organic' as const,
      sourceHandle: handles.sourceHandle,
      targetHandle: handles.targetHandle,
      data: {
        ...edge.data,
        branchColor: edge.data?.branchColor ?? resolveBranchColor(depth),
      },
    };
  });
}
