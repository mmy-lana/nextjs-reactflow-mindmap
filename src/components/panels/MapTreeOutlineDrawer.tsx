"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { useReactFlow } from "@xyflow/react";
import { useMindMapStore } from "@/store/useMindMapStore";
import { Drawer } from "@/components/ui/Drawer";
import { IconButton } from "@/components/ui/IconButton";
import { NodeStatusBadge } from "@/components/nodes/parts/NodeStatusBadge";
import { buildAcyclicChildIndex, findRootNode } from "@/lib/treeTransforms";
import { UNNAMED_NODE_LABEL, type CanvasEdge, type CanvasNode } from "@/types/mindmap";
import { cn } from "@/lib/cn";

/**
 * The map as an outline.
 *
 * A canvas is spatial, which makes it a poor index: a map with two hundred nodes
 * has no way to say "the node called Shipping". This drawer is that index. It
 * reads the same store the canvas does, so collapsing a branch here collapses it
 * there, and picking a row selects the node and brings it into view.
 *
 * The search box keeps the ancestors of every match, because a match whose
 * parents are missing is not a result, it is a mystery.
 */

interface OutlineRow {
  node: CanvasNode;
  hasChildren: boolean;
  isCollapsed: boolean;
}

interface Outline {
  rows: OutlineRow[];
  matchCount: number;
  /** True while at least one branch is open, which is what the toggle acts on. */
  hasExpandedBranch: boolean;
}

export function MapTreeOutlineDrawer(): React.JSX.Element {
  const activeDrawer = useMindMapStore((state) => state.activeDrawer);
  const setActiveDrawer = useMindMapStore((state) => state.setActiveDrawer);
  const nodes = useMindMapStore((state) => state.nodes);
  const edges = useMindMapStore((state) => state.edges);
  const selectedNodeId = useMindMapStore((state) => state.selectedNodeId);
  const setSelectedNodeId = useMindMapStore((state) => state.setSelectedNodeId);
  const toggleSubtreeCollapse = useMindMapStore((state) => state.toggleSubtreeCollapse);
  const setAllSubtreesCollapsed = useMindMapStore((state) => state.setAllSubtreesCollapsed);
  const { setCenter } = useReactFlow();

  const [query, setQuery] = useState('');

  const isOpen = activeDrawer === 'outline';
  const isFiltering = query.trim().length > 0;

  const { rows, matchCount, hasExpandedBranch } = useMemo(
    () => buildOutline(nodes, edges, query.trim()),
    [nodes, edges, query],
  );

  const focusNode = useCallback(
    (node: CanvasNode) => {
      setSelectedNodeId(node.id);
      // `position` is the top left corner; setCenter wants the middle of the node.
      const width = node.measured?.width ?? node.width ?? 0;
      const height = node.measured?.height ?? node.height ?? 0;
      void setCenter(node.position.x + width / 2, node.position.y + height / 2, {
        duration: 300,
        zoom: 1,
      });
    },
    [setCenter, setSelectedNodeId],
  );

  return (
    <Drawer
      isOpen={isOpen}
      onClose={() => setActiveDrawer(null)}
      title="Map outline"
      description={
        isFiltering
          ? `${matchCount} ${matchCount === 1 ? 'match' : 'matches'} across ${rows.length} shown`
          : `${rows.length} of ${nodes.length} ${nodes.length === 1 ? 'node' : 'nodes'} shown`
      }
      offsetForToolbar
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-canvas-muted"
            />
            <input
              type="search"
              value={query}
              placeholder="Filter by label"
              aria-label="Filter nodes by label"
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              className="min-h-touch-target w-full rounded-lg border border-node-border bg-node-surface pr-10 pl-9 text-sm text-canvas-text outline-none transition-colors focus-visible:border-accent"
            />
            {isFiltering && (
              <span className="absolute top-1/2 right-1 -translate-y-1/2">
                <IconButton
                  label="Clear filter"
                  variant="ghost"
                  onClick={() => {
                    setQuery('');
                  }}
                >
                  <X className="size-4" />
                </IconButton>
              </span>
            )}
          </div>
          <IconButton
            label={hasExpandedBranch ? 'Collapse all branches' : 'Expand all branches'}
            onClick={() => {
              setAllSubtreesCollapsed(hasExpandedBranch);
            }}
            disabled={!hasExpandedBranch && !nodes.some((node) => node.data.isCollapsed === true)}
          >
            {hasExpandedBranch ? (
              <ChevronDown className="size-5" />
            ) : (
              <ChevronRight className="size-5" />
            )}
          </IconButton>
        </div>

        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-node-border p-4 text-sm text-canvas-muted">
            {nodes.length === 0
              ? 'This map has no nodes yet. Use Add in the toolbar to start one.'
              : 'No node matches that filter.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5" role="tree" aria-label="Map outline">
            {rows.map((row) => (
              <li key={row.node.id} role="none">
                <OutlineRowItem
                  row={row}
                  isSelected={row.node.id === selectedNodeId}
                  onFocusNode={focusNode}
                  onToggleCollapse={toggleSubtreeCollapse}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  );
}

interface OutlineRowItemProps {
  row: OutlineRow;
  isSelected: boolean;
  onFocusNode: (node: CanvasNode) => void;
  onToggleCollapse: (nodeId: string) => void;
}

function OutlineRowItem({
  row,
  isSelected,
  onFocusNode,
  onToggleCollapse,
}: OutlineRowItemProps): React.JSX.Element {
  const { node, hasChildren, isCollapsed } = row;
  const label = node.data.label.trim() || UNNAMED_NODE_LABEL;

  return (
    <div
      role="treeitem"
      aria-selected={isSelected}
      aria-level={node.data.depth + 1}
      aria-expanded={hasChildren ? !isCollapsed : undefined}
      className={cn(
        'flex items-center gap-1 rounded-lg pr-1 transition-colors',
        isSelected ? 'bg-accent-soft' : 'hover:bg-node-surface-hover',
      )}
    >
      {hasChildren ? (
        <IconButton
          label={isCollapsed ? `Expand ${label}` : `Collapse ${label}`}
          variant="ghost"
          onClick={() => {
            onToggleCollapse(node.id);
          }}
        >
          {isCollapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
        </IconButton>
      ) : (
        // Reserves the chevron's width so the labels of a branch line up.
        <span aria-hidden="true" className="size-11 shrink-0" />
      )}

      <button
        type="button"
        onClick={() => {
          onFocusNode(node);
        }}
        style={{ paddingLeft: `${Math.min(node.data.depth, 6) * 4}px` }}
        className="flex min-h-touch-target min-w-0 flex-1 items-center gap-2 py-1 text-left"
      >
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-sm',
            isSelected ? 'text-accent' : 'text-canvas-text',
          )}
        >
          {label}
        </span>
        {hasChildren && (
          <span className="shrink-0 text-xs text-canvas-muted tabular-nums">
            {node.data.childCount}
          </span>
        )}
        <NodeStatusBadge status={node.data.status} compact />
      </button>
    </div>
  );
}

/**
 * Flattens the tree into the rows that are actually on screen, honouring
 * collapsed branches and the search filter.
 *
 * A row survives the filter when it matches or when any descendant does, which
 * is what keeps a match's ancestors beside it. While filtering, collapsed
 * branches are walked anyway: a match buried under a collapsed branch is the
 * exact case the search box exists for.
 */
function buildOutline(
  nodes: readonly CanvasNode[],
  edges: readonly CanvasEdge[],
  query: string,
): Outline {
  const empty: Outline = { rows: [], matchCount: 0, hasExpandedBranch: false };
  const root = findRootNode(nodes);
  if (!root) {
    return empty;
  }

  const childIndex = buildAcyclicChildIndex(nodes, edges);
  const normalizedQuery = query.toLowerCase();
  const isFiltering = normalizedQuery.length > 0;

  const rows: OutlineRow[] = [];
  let matchCount = 0;

  /** Returns whether the subtree rooted at `node` contains a match. */
  const visit = (node: CanvasNode): boolean => {
    const children = (childIndex.get(node.id) ?? []).filter((child) => child.hidden !== true);
    const hasChildren = children.length > 0;
    const selfMatches = !isFiltering || node.data.label.toLowerCase().includes(normalizedQuery);
    if (selfMatches && isFiltering) {
      matchCount += 1;
    }

    let subtreeMatches = false;
    if (hasChildren && (isFiltering || node.data.isCollapsed !== true)) {
      for (const child of children) {
        if (visit(child)) {
          subtreeMatches = true;
        }
      }
    }

    if (isFiltering && !selfMatches && !subtreeMatches) {
      return false;
    }

    rows.push({ node, hasChildren, isCollapsed: node.data.isCollapsed === true });
    return selfMatches || subtreeMatches;
  };

  visit(root);

  const hasExpandedBranch = nodes.some(
    (node) => node.hidden !== true && node.data.childCount > 0 && node.data.isCollapsed !== true,
  );

  return { rows, matchCount, hasExpandedBranch };
}
