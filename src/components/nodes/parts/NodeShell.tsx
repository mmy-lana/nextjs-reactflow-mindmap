"use client";

import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, MoreHorizontal, StickyNote } from "lucide-react";
import { useStore, type NodeProps } from "@xyflow/react";
import { useMindMapStore } from "@/store/useMindMapStore";
import { InlineTextEditor } from "@/components/nodes/parts/InlineTextEditor";
import { NodeActionsQuickMenu } from "@/components/nodes/parts/NodeActionsQuickMenu";
import { NodeHandleGroup } from "@/components/nodes/parts/NodeHandleGroup";
import { NodeStatusBadge } from "@/components/nodes/parts/NodeStatusBadge";
import type { MindMapNodeData, MindMapNodeType, NodeShape } from "@/types/mindmap";
import type { CanvasNode } from "@/types/mindmap";
import { cn } from "@/lib/cn";

/**
 * The body shared by the root, branch and leaf nodes.
 *
 * Keeping one shell means the selection ring, the handles, the collapse control
 * and the action menu cannot drift apart between the three variants; the
 * variants only choose padding, radius and which decorations to show.
 */

const SHAPE_CLASS: Readonly<Record<NodeShape, string>> = {
  rounded: 'rounded-xl',
  rectangle: 'rounded-none',
  pill: 'rounded-full',
  underline: 'rounded-none border-b-2 border-t-0',
};

export interface NodeShellProps extends NodeProps<CanvasNode> {
  variant: MindMapNodeType;
  /** Extra decorations rendered between the label and the actions. */
  children?: ReactNode;
  /** The leaf has no branch indicator; the root shows its status underneath. */
  isCompact?: boolean;
}

function NodeShellComponent({ variant, children, isCompact = false, ...props }: NodeShellProps) {
  const { data, id, selected, width, height, positionAbsoluteX, positionAbsoluteY } = props;
  const node: MindMapNodeData = data;

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);

  const editingNodeId = useMindMapStore((state) => state.editingNodeId);
  const setEditingNodeId = useMindMapStore((state) => state.setEditingNodeId);
  const setSelectedNodeId = useMindMapStore((state) => state.setSelectedNodeId);
  const updateNodeLabel = useMindMapStore((state) => state.updateNodeLabel);
  const toggleSubtreeCollapse = useMindMapStore((state) => state.toggleSubtreeCollapse);
  // Read from React Flow's own store rather than duplicating the flag: this is
  // exactly the value the `<ReactFlow nodesConnectable>` prop put there, so the
  // handles cannot disagree with the canvas.
  const nodesConnectable = useStore((state) => state.nodesConnectable);
  const isRunning = useMindMapStore((state) => state.isLayoutRunning);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const isRoot = variant === 'root';
  const isEditing = editingNodeId === id;
  const hasNotes = typeof node.notes === 'string' && node.notes.trim().length > 0;
  const childCount = node.childCount;
  // A node that is mid-drag is not a node you want to re-measure on hover.
  const measuredWidth = width ?? 0;
  const measuredHeight = height ?? 0;

  return (
    <div
      ref={shellRef}
      data-testid={`node-${variant}`}
      className={cn(
        'group relative flex flex-col justify-center gap-1 border transition-[box-shadow,border-color,background-color] duration-150',
        'px-3 py-2 text-left',
        !isRoot && 'cursor-grab active:cursor-grabbing',
        // The shape key wins over the variant's own rounding.
        SHAPE_CLASS[node.style.shape],
        variant === 'root' && 'min-w-44 px-4 py-3',
        variant === 'leaf' && 'min-w-36',
        isCompact && 'px-3 py-1.5',
        selected && 'shadow-[0_0_0_2px_var(--color-canvas-bg),0_0_0_4px_var(--color-accent)]',
      )}
      style={{
        width: measuredWidth > 0 ? measuredWidth : undefined,
        minHeight: measuredHeight > 0 ? measuredHeight : undefined,
        backgroundColor: node.style.backgroundColor,
        borderColor: selected ? 'var(--color-accent)' : node.style.borderColor,
        borderWidth: Math.max(node.style.borderWidth, 1),
        // A translucent border on an opaque surface still reads as a line.
        borderStyle: node.style.shape === 'underline' ? 'none' : 'solid',
      }}
      onClick={(event) => {
        event.stopPropagation();
        setSelectedNodeId(id);
      }}
    >
      <NodeHandleGroup
        direction={node.direction}
        depth={node.depth}
        isRoot={isRoot}
        isConnectable={nodesConnectable && !isRunning}
      />

      <div className="flex items-start gap-2">
        {isRoot ? (
          <div className="min-w-0 flex-1">
            <InlineTextEditor
              nodeId={id}
              value={node.label}
              onCommit={updateNodeLabel}
              fontSize={node.style.fontSize}
              fontWeight={node.style.fontWeight}
              textColor={node.style.textColor}
              className="leading-snug"
              ariaLabel="Root label"
              centerX={positionAbsoluteX + measuredWidth / 2}
              centerY={positionAbsoluteY + measuredHeight / 2}
              isEditing={isEditing}
              onEditingChange={(editing) => {
                setEditingNodeId(editing ? id : null);
              }}
            />
            <NodeStatusBadge status={node.status} className="mt-1.5" />
          </div>
        ) : (
          <>
            {/* A collapsed branch is a fold: the chevron is the only way back in. */}
            {/*
              A 44px pointer target without a 44px layout footprint.

              The chevron is drawn 24px so a branch row stays compact, and the
              matching negative margin cancels the extra size the touch minimum
              adds. The box the pointer sees is the full 44x44, which is what a
              fingertip needs, while the node keeps the height it had.
            */}
            {childCount > 0 && (
              <button
                type="button"
                aria-label={node.isCollapsed ? 'Expand branch' : 'Collapse branch'}
                data-testid="collapse-toggle"
                className="nodrag -m-2.5 flex size-6 min-h-touch-target min-w-touch-target shrink-0 items-center justify-center"
                onClick={(event) => {
                  event.stopPropagation();
                  toggleSubtreeCollapse(id);
                }}
              >
                <span className="flex size-6 items-center justify-center rounded-md text-canvas-muted transition-colors hover:bg-node-surface-hover hover:text-canvas-text">
                  <ChevronRight
                    aria-hidden="true"
                    className={cn(
                      'size-4 transition-transform duration-200',
                      !node.isCollapsed && 'rotate-90',
                    )}
                  />
                </span>
              </button>
            )}
            <div className="min-w-0 flex-1">
              <InlineTextEditor
                nodeId={id}
                value={node.label}
                onCommit={updateNodeLabel}
                fontSize={node.style.fontSize}
                fontWeight={node.style.fontWeight}
                textColor={node.style.textColor}
                className="leading-snug"
                ariaLabel="Node label"
                centerX={positionAbsoluteX + measuredWidth / 2}
                centerY={positionAbsoluteY + measuredHeight / 2}
                isEditing={isEditing}
                onEditingChange={(editing) => {
                  setEditingNodeId(editing ? id : null);
                }}
              />
              {node.status && <NodeStatusBadge status={node.status} className="mt-1" />}
            </div>
          </>
        )}
      </div>

      {hasNotes && (
        <span
          className="pointer-events-none absolute top-1.5 right-1.5 text-canvas-muted"
          title="Has notes"
        >
          <StickyNote aria-hidden="true" className="size-3.5" />
          <span className="sr-only">This node has notes</span>
        </span>
      )}

      {/* The menu trigger only exists once the node is selected: a permanently
          visible overflow button on every node would bury the map in chrome. */}
      <button
        type="button"
        aria-label="Node actions"
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
        className={cn(
          /**
           * A 44px pointer target around a 28px bubble.
           *
           * The bubble is deliberately small so it does not cover the node
           * label, and making the element itself 44px would do that anyway.
           * The invisible `after` box is the hit area instead: a pseudo element
           * still belongs to its button for hit testing, and it is drawn
           * underneath the bubble by the negative inset, so what the user sees
           * is unchanged.
           */
          'nodrag absolute -right-2.5 -bottom-2.5 flex size-7 items-center justify-center rounded-full',
          // `after:` generates the pseudo-element and sets its `content`, so the
          // box exists purely for hit testing and paints nothing.
          'after:absolute after:-inset-2 after:rounded-full',
          'border border-node-border bg-surface-overlay text-canvas-muted shadow-lg shadow-black/40',
          'transition-[opacity,transform] duration-150 hover:scale-105 hover:text-canvas-text',
          selected
            ? 'opacity-100 focus-visible:opacity-100'
            : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
          // A collapsed branch is short; the button would overlap the chevron.
          isMenuOpen && 'opacity-100',
        )}
        onClick={(event) => {
          event.stopPropagation();
          setIsMenuOpen((open) => !open);
        }}
      >
        <MoreHorizontal aria-hidden="true" className="size-4" />
      </button>

      {isMenuOpen && isMounted && shellRef.current && (
        // The menu is portalled to the body: the node lives inside the
        // transformed canvas viewport, and a `position: fixed` child of a
        // transformed element is positioned against that element instead of
        // the viewport.
        createPortal(
          <NodeActionsQuickMenu
            nodeId={id}
            anchor={shellRef.current}
            childCount={childCount}
            isCollapsed={node.isCollapsed === true}
            status={node.status}
            onClose={() => {
              setIsMenuOpen(false);
            }}
          />,
          document.body,
        )
      )}

      {children}
    </div>
  );
}

export const NodeShell = memo(NodeShellComponent);
