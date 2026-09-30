/**
 * Pure graph traversal helpers for the mind map.
 *
 * The mind map is stored as a flat node list plus an edge list, which means
 * every "subtree" question is answered by walking the edge set. User edits,
 * imported files and corrupted records can all produce cyclic graphs, so every
 * recursive helper in this module is cycle-guarded and always terminates.
 *
 * No store, no database, no DOM: functions here take snapshots and return new
 * snapshots.
 */

import {
  DEFAULT_NODE_SIZE,
  isBranchSide,
  type CanvasEdge,
  type CanvasNode,
  type NodeDepth,
  type NodeDirection,
} from '@/types/mindmap';

/** Compares two sibling nodes by their `order` field, then by id for stability. */
function compareByOrder(a: CanvasNode, b: CanvasNode): number {
  const orderA = Number.isFinite(a.data.order) ? a.data.order : 0;
  const orderB = Number.isFinite(b.data.order) ? b.data.order : 0;
  if (orderA !== orderB) {
    return orderA - orderB;
  }
  return a.id.localeCompare(b.id);
}

/** Indexes nodes by id for O(1) lookups during traversal. */
export function buildNodeLookup(nodes: readonly CanvasNode[]): Map<string, CanvasNode> {
  const lookup = new Map<string, CanvasNode>();
  for (const node of nodes) {
    if (node && typeof node.id === 'string' && !lookup.has(node.id)) {
      lookup.set(node.id, node);
    }
  }
  return lookup;
}

/** Returns the ids of the direct children of a node, in insertion order. */
export function getChildIds(nodeId: string, edges: readonly CanvasEdge[]): string[] {
  const childIds: string[] = [];
  const seen = new Set<string>();
  for (const edge of edges) {
    if (edge?.source === nodeId && typeof edge.target === 'string' && !seen.has(edge.target)) {
      seen.add(edge.target);
      childIds.push(edge.target);
    }
  }
  return childIds;
}

/**
 * Collects every descendant id of a node.
 *
 * The `visited` set is shared across the whole recursion, so a corrupted graph
 * containing a cycle terminates instead of overflowing the stack. Each id is
 * emitted at most once even when several parents point at the same node, which
 * makes the result safe to feed straight into a delete operation.
 *
 * @param nodeId Node whose subtree is collected. The node itself is not part of
 *               the result.
 * @param edges Edge list describing the parent/child relations.
 * @param visited Internal cycle guard, exposed so callers can reuse one set.
 * @returns Descendant ids in breadth-then-depth order, without duplicates.
 */
export function collectDescendants(
  nodeId: string,
  edges: readonly CanvasEdge[],
  visited: Set<string> = new Set<string>(),
): string[] {
  if (visited.has(nodeId)) {
    return [];
  }
  visited.add(nodeId);

  const directChildren: string[] = [];
  const queued = new Set<string>();
  for (const edge of edges) {
    if (edge?.source !== nodeId) {
      continue;
    }
    const target = edge.target;
    if (typeof target !== 'string' || queued.has(target) || visited.has(target)) {
      continue;
    }
    queued.add(target);
    directChildren.push(target);
  }

  const allDescendants: string[] = [];
  for (const childId of directChildren) {
    // A sibling branch may already have reached this node (shared child or
    // back edge); emitting it twice would corrupt a delete operation.
    if (visited.has(childId)) {
      continue;
    }
    allDescendants.push(childId, ...collectDescendants(childId, edges, visited));
  }

  return allDescendants;
}

/** Collects every descendant node object, ordered by their `order` field. */
export function collectDescendantNodes(
  nodeId: string,
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
): CanvasNode[] {
  const lookup = buildNodeLookup(nodes);
  const visited = new Set<string>();
  const descendants: CanvasNode[] = [];
  const queue = [nodeId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (currentId === undefined || visited.has(currentId)) {
      continue;
    }
    visited.add(currentId);

    for (const childId of getChildIds(currentId, edges)) {
      if (visited.has(childId)) {
        continue;
      }
      const child = lookup.get(childId);
      if (child) {
        visited.add(childId);
        descendants.push(child);
        queue.push(childId);
      }
    }
  }

  return descendants.sort(compareByOrder);
}

/** Collects the ancestor chain of a node, closest ancestor first. */
export function collectAncestorNodes(
  nodeId: string,
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
): CanvasNode[] {
  const lookup = buildNodeLookup(nodes);
  const parentByChild = new Map<string, string>();
  for (const edge of edges) {
    if (!parentByChild.has(edge.target)) {
      parentByChild.set(edge.target, edge.source);
    }
  }

  const ancestors: CanvasNode[] = [];
  const visited = new Set<string>([nodeId]);
  let currentId = parentByChild.get(nodeId);

  while (currentId !== undefined && !visited.has(currentId)) {
    visited.add(currentId);
    const ancestor = lookup.get(currentId);
    if (!ancestor) {
      break;
    }
    ancestors.push(ancestor);
    currentId = parentByChild.get(currentId);
  }

  return ancestors;
}

/** Reports whether `candidateId` lives somewhere under `ancestorId`. */
export function isDescendantOf(
  candidateId: string,
  ancestorId: string,
  edges: readonly CanvasEdge[],
): boolean {
  if (candidateId === ancestorId) {
    return false;
  }
  return collectDescendants(ancestorId, edges).includes(candidateId);
}

/** Returns the direct children of a node, sorted by their `order` field. */
export function getChildNodes(
  nodeId: string,
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
): CanvasNode[] {
  const lookup = buildNodeLookup(nodes);
  const children: CanvasNode[] = [];
  const seen = new Set<string>();

  for (const childId of getChildIds(nodeId, edges)) {
    if (seen.has(childId)) {
      continue;
    }
    seen.add(childId);
    const child = lookup.get(childId);
    if (child) {
      children.push(child);
    }
  }

  return children.sort(compareByOrder);
}

/** Returns the other nodes sharing the same parent, sorted by `order`. */
export function getSiblingNodes(
  node: CanvasNode,
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
): CanvasNode[] {
  const parentId = node.data.parentId ?? null;
  if (!parentId) {
    return [];
  }
  return getChildNodes(parentId, nodes, edges).filter((sibling) => sibling.id !== node.id);
}

/** Sorts a sibling list using the canonical mind map ordering rules. */
export function sortSiblingsByOrder(siblings: readonly CanvasNode[]): CanvasNode[] {
  return [...siblings].sort(compareByOrder);
}

/**
 * Returns the order value a node appended to `siblings` should receive.
 *
 * The value is derived from the highest existing order so that inserting a
 * node never silently reuses a slot already taken by another sibling.
 *
 * @param siblings Current children of the target parent, in any order.
 * @returns `0` for an empty list, otherwise `max(order) + 1`.
 */
export function calculateNodeOrder(siblings: readonly CanvasNode[]): number {
  let highest = -1;
  for (const sibling of siblings) {
    const order = sibling?.data?.order;
    if (typeof order === 'number' && Number.isFinite(order) && order > highest) {
      highest = Math.floor(order);
    }
  }
  return highest + 1;
}

/**
 * Rewrites the `order` field of a sibling list so it is a dense `0..n-1`
 * sequence, and returns the normalized list. Used after deletions to keep the
 * layout deterministic.
 */
export function normalizeSiblingOrders(siblings: readonly CanvasNode[]): CanvasNode[] {
  return sortSiblingsByOrder(siblings).map((node, index) => ({
    ...node,
    data: { ...node.data, order: index },
  }));
}

/**
 * Finds the root concept of a map.
 *
 * Resolution order, most explicit first:
 * 1. a single node at depth `0` without a parent,
 * 2. the node typed `root`,
 * 3. the shallowest node, ties broken by `order` then by id.
 *
 * @returns `undefined` when the node list is empty.
 */
export function findRootNode(nodes: readonly CanvasNode[]): CanvasNode | undefined {
  if (nodes.length === 0) {
    return undefined;
  }

  const parentlessRoots = nodes.filter(
    (node) => node.data.depth === 0 && (node.data.parentId === null || node.data.parentId === undefined),
  );
  if (parentlessRoots.length === 1) {
    return parentlessRoots[0];
  }
  if (parentlessRoots.length > 1) {
    return [...parentlessRoots].sort(compareByOrder)[0];
  }

  const typedRoot = nodes.find((node) => node.type === 'root');
  if (typedRoot) {
    return typedRoot;
  }

  return [...nodes].sort((a, b) => {
    const depthDelta = (a.data.depth || 0) - (b.data.depth || 0);
    return depthDelta !== 0 ? depthDelta : compareByOrder(a, b);
  })[0];
}

/** Builds a `parent id -> sorted children` index in a single pass. */
export function buildChildIndex(
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
): Map<string, CanvasNode[]> {
  const lookup = buildNodeLookup(nodes);
  const index = new Map<string, CanvasNode[]>();

  for (const node of nodes) {
    index.set(node.id, []);
  }

  for (const edge of edges) {
    const source = index.get(edge.source);
    const child = lookup.get(edge.target);
    if (source && child) {
      source.push(child);
    }
  }

  for (const [id, children] of index) {
    index.set(id, children.sort(compareByOrder));
  }

  return index;
}

/**
 * Builds a child index that is guaranteed to be acyclic and rooted at the map
 * root.
 *
 * The traversal starts from {@link findRootNode}; edges pointing at unknown
 * nodes are dropped, and an edge that would make a node its own ancestor is
 * ignored. Every reachable node is registered in the resulting index (with an
 * empty child list when it is a leaf), so consumers can look up any node id.
 */
export function buildAcyclicChildIndex(
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
): Map<string, CanvasNode[]> {
  const lookup = buildNodeLookup(nodes);
  const index = new Map<string, CanvasNode[]>();
  for (const node of nodes) {
    index.set(node.id, []);
  }

  const root = findRootNode(nodes);
  if (!root) {
    return index;
  }

  const accepted = new Set<string>();
  const path = new Set<string>();

  const walk = (nodeId: string): void => {
    if (accepted.has(nodeId) || path.has(nodeId)) {
      return;
    }
    accepted.add(nodeId);
    path.add(nodeId);

    const children = getChildIds(nodeId, edges);
    for (const childId of children) {
      // Unknown node or a back edge towards an ancestor: skip it.
      if (!lookup.has(childId) || path.has(childId)) {
        continue;
      }
      index.get(nodeId)?.push(lookup.get(childId) as CanvasNode);
      walk(childId);
    }

    index.set(nodeId, sortSiblingsByOrder(index.get(nodeId) ?? []));
    path.delete(nodeId);
  };

  walk(root.id);
  return index;
}

/**
 * Repairs derived node metadata after the edge set changed.
 *
 * `data.parentId`, `data.childCount` and `data.depth` are mirrors of the graph;
 * recomputing them keeps a map loaded from disk (or from an imported file, or
 * after a re-parent) consistent. Every other field, including the position, is
 * preserved.
 */
export function reindexNodeMetadata(
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
): CanvasNode[] {
  const lookup = buildNodeLookup(nodes);
  const parentByChild = new Map<string, string>();
  const childCountByParent = new Map<string, number>();
  const childIdsByParent = new Map<string, string[]>();

  for (const edge of edges) {
    if (!lookup.has(edge.source) || !lookup.has(edge.target)) {
      continue;
    }
    if (edge.source === edge.target) {
      continue;
    }
    if (!parentByChild.has(edge.target)) {
      parentByChild.set(edge.target, edge.source);
    }
    childCountByParent.set(edge.source, (childCountByParent.get(edge.source) ?? 0) + 1);
    const siblings = childIdsByParent.get(edge.source);
    if (siblings) {
      siblings.push(edge.target);
    } else {
      childIdsByParent.set(edge.source, [edge.target]);
    }
  }

  // Breadth first from every parentless node, so a node can only be reached by
  // one path and no node is visited twice.
  const depthById = new Map<string, number>();
  const queue: string[] = [];
  for (const node of nodes) {
    if (!parentByChild.has(node.id)) {
      depthById.set(node.id, 0);
      queue.push(node.id);
    }
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const nodeId = queue[cursor];
    const depth = (depthById.get(nodeId) ?? 0) + 1;
    for (const childId of childIdsByParent.get(nodeId) ?? []) {
      if (!depthById.has(childId)) {
        depthById.set(childId, depth);
        queue.push(childId);
      }
    }
  }

  return nodes.map((node) => {
    const parentId = parentByChild.get(node.id) ?? null;
    const childCount = childCountByParent.get(node.id) ?? 0;
    // A node in a cycle is unreachable from a root; its stored depth is kept
    // rather than reset, so the inconsistency stays visible instead of being
    // silently turned into a second root.
    const depth = depthById.get(node.id) ?? node.data.depth;
    const type: CanvasNode['type'] = depth === 0 ? 'root' : childCount > 0 ? 'branch' : 'leaf';

    if (
      node.data.parentId === parentId &&
      node.data.childCount === childCount &&
      node.data.depth === depth &&
      node.type === type
    ) {
      return node;
    }

    return {
      ...node,
      type,
      data: {
        ...node.data,
        parentId,
        childCount,
        depth,
      },
    };
  });
}

/**
 * Returns the ids hidden by the current collapse state: every node that has
 * at least one collapsed ancestor. Collapsed nodes themselves stay visible.
 */
export function collectHiddenNodeIds(
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
): Set<string> {
  const hidden = new Set<string>();
  const childIndex = buildAcyclicChildIndex(nodes, edges);
  const lookup = buildNodeLookup(nodes);
  const visited = new Set<string>();

  const visit = (nodeId: string, hiddenByAncestor: boolean): void => {
    if (visited.has(nodeId)) {
      return;
    }
    visited.add(nodeId);

    const node = lookup.get(nodeId);
    if (!node) {
      return;
    }
    if (hiddenByAncestor) {
      hidden.add(nodeId);
    }

    const hidesChildren = hiddenByAncestor || node.data.isCollapsed === true;
    for (const child of childIndex.get(nodeId) ?? []) {
      visit(child.id, hidesChildren);
    }
  };

  const root = findRootNode(nodes);
  if (root) {
    visit(root.id, false);
  }
  // Disconnected components of a corrupted map are traversed as well, so a
  // collapsed orphan still hides its own subtree.
  for (const node of nodes) {
    visit(node.id, false);
  }

  return hidden;
}

/**
 * Resolves the side a node and its subtree are attached to.
 *
 * @param node Node being resolved.
 * @param parentSide Side inherited from the parent branch.
 * @param siblingIndex Position among the siblings, used as the tie breaker for
 *                     first generation nodes that carry the `CENTER` direction.
 */
export function resolveBranchSide(
  node: CanvasNode,
  parentSide: NodeDirection,
  siblingIndex: number,
): 'LEFT' | 'RIGHT' {
  if (isBranchSide(node.data.direction)) {
    return node.data.direction;
  }
  if (isBranchSide(parentSide)) {
    return parentSide;
  }
  return siblingIndex % 2 === 0 ? 'RIGHT' : 'LEFT';
}

/** Computes the depth of a node from the edge set, cycle-guarded. */
export function calculateNodeDepth(
  nodeId: string,
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
): NodeDepth {
  return collectAncestorNodes(nodeId, nodes, edges).length;
}

/** Resolves the rendered footprint of a node, falling back to the defaults. */
export function resolveNodeSize(node: CanvasNode): { width: number; height: number } {
  const measuredWidth = node.measured?.width;
  const measuredHeight = node.measured?.height;

  const width =
    typeof measuredWidth === 'number' && Number.isFinite(measuredWidth) && measuredWidth > 0
      ? measuredWidth
      : typeof node.width === 'number' && Number.isFinite(node.width) && node.width > 0
        ? node.width
        : DEFAULT_NODE_SIZE.width;

  const height =
    typeof measuredHeight === 'number' && Number.isFinite(measuredHeight) && measuredHeight > 0
      ? measuredHeight
      : typeof node.height === 'number' && Number.isFinite(node.height) && node.height > 0
        ? node.height
        : DEFAULT_NODE_SIZE.height;

  return { width, height };
}
