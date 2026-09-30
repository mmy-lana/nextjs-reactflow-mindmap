"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useDismiss,
  useFloating,
  useInteractions,
} from "@floating-ui/react";
import { ChevronRight, CornerDownRight, GitBranchPlus, ListPlus, Pencil, Trash2 } from "lucide-react";
import { useMindMapStore } from "@/store/useMindMapStore";
import { FOCUSABLE_ITEM_SELECTOR } from "@/lib/focusable";
import { NODE_STATUS_META, NODE_STATUS_ORDER, type NodeStatus } from "@/types/mindmap";
import { cn } from "@/lib/cn";

/**
 * The per-node action menu.
 *
 * The node sits inside a transformed React Flow viewport, so the menu is
 * positioned from the node's own bounding rect with the `fixed` strategy: that
 * rect is already screen space, which survives the canvas zoom. `flip` and
 * `shift` keep the menu on screen when the node is near an edge, and `autoUpdate`
 * follows the node while the canvas pans underneath an open menu.
 *
 * The status list expands inside the same popover rather than as a nested
 * floating element, so only one layer can ever own focus.
 */

export interface NodeActionsQuickMenuProps {
  nodeId: string;
  /** The node's DOM element, used as the positioning reference. */
  anchor: HTMLElement | null;
  /** Number of direct children, which decides whether collapsing is offered. */
  childCount: number;
  isCollapsed: boolean;
  /** Current status, or `undefined` when unset. */
  status: NodeStatus | undefined;
  onClose: () => void;
}

type MenuActionId = 'rename' | 'addChild' | 'addSibling' | 'toggleCollapse' | 'delete';

interface MenuAction {
  id: MenuActionId;
  label: string;
  icon: typeof GitBranchPlus;
  isDanger?: boolean;
  isDisabled?: boolean;
}

export function NodeActionsQuickMenu({
  nodeId,
  anchor,
  childCount,
  isCollapsed,
  status,
  onClose,
}: NodeActionsQuickMenuProps): React.JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null);
  const [isStatusOpen, setIsStatusOpen] = useState(false);

  const addNode = useMindMapStore((state) => state.addNode);
  const addSibling = useMindMapStore((state) => state.addSibling);
  const deleteSubtree = useMindMapStore((state) => state.deleteSubtree);
  const toggleSubtreeCollapse = useMindMapStore((state) => state.toggleSubtreeCollapse);
  const updateNodeStatus = useMindMapStore((state) => state.updateNodeStatus);
  const setEditingNodeId = useMindMapStore((state) => state.setEditingNodeId);
  const isRoot = useMindMapStore(
    (state) => state.nodes.find((node) => node.id === nodeId)?.data.depth === 0,
  );

  const { refs, floatingStyles, context } = useFloating({
    // The reference is a live DOM element the canvas keeps moving, so the
    // position has to be recomputed instead of measured once.
    elements: { reference: anchor },
    strategy: 'fixed',
    placement: 'bottom-start',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip({ padding: 12, fallbackAxisSideDirection: 'start' }),
      shift({ padding: 12 }),
      size({
        padding: 12,
        apply({ availableHeight, elements }) {
          // A menu taller than the free space scrolls instead of being clipped.
          elements.floating.style.maxHeight = `${Math.max(availableHeight, 120)}px`;
        },
      }),
    ],
  });

  // Reading the elements from the floating context means a press on the node
  // itself does not count as an outside press, and an Escape anywhere closes
  // the menu. The returned props are spread onto the menu element below.
  const dismiss = useDismiss(context, { outsidePress: true, escapeKey: true });
  const { getFloatingProps } = useInteractions([dismiss]);

  const actions = useMemo<MenuAction[]>(() => {
    const list: MenuAction[] = [
      // Renaming is the one action the menu used to be missing: double tapping
      // the label is not discoverable, and on a phone it competes with the tap
      // that selects the node.
      { id: 'rename', label: 'Rename node', icon: Pencil },
      { id: 'addChild', label: 'Add child', icon: CornerDownRight },
      { id: 'addSibling', label: 'Add sibling', icon: GitBranchPlus, isDisabled: isRoot },
    ];
    if (childCount > 0) {
      list.push({
        id: 'toggleCollapse',
        label: isCollapsed ? 'Expand branch' : 'Collapse branch',
        icon: ListPlus,
      });
    }
    // The root is the document; deleting it would leave nothing to lay out.
    if (!isRoot) {
      list.push({ id: 'delete', label: 'Delete node', icon: Trash2, isDanger: true });
    }
    return list;
  }, [childCount, isCollapsed, isRoot]);

  const runAction = useCallback(
    (actionId: MenuActionId) => {
      switch (actionId) {
        case 'rename':
          // The menu closes first: the field mounts inside the node, which sits
          // under a transformed viewport, and an open popover would steal focus
          // back on its own unmount.
          setEditingNodeId(nodeId);
          break;
        case 'addChild':
          addNode(nodeId);
          break;
        case 'addSibling':
          if (!isRoot) {
            addSibling(nodeId);
          }
          break;
        case 'toggleCollapse':
          toggleSubtreeCollapse(nodeId);
          break;
        case 'delete':
          deleteSubtree(nodeId);
          break;
      }
      onClose();
    },
    [
      addNode,
      addSibling,
      deleteSubtree,
      nodeId,
      isRoot,
      onClose,
      setEditingNodeId,
      toggleSubtreeCollapse,
    ],
  );

  // Focus lands on the first action so a keyboard user is inside the menu
  // rather than behind it.
  useEffect(() => {
    menuRef.current?.querySelector<HTMLElement>(FOCUSABLE_ITEM_SELECTOR)?.focus();
  }, []);

  const onKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab') {
      // A menu is not a tab stop sequence; Tab leaves it and dismisses.
      event.preventDefault();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') {
      return;
    }
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_ITEM_SELECTOR) ?? [],
    );
    if (items.length === 0) {
      return;
    }
    event.preventDefault();
    const currentIndex = items.indexOf(event.target as HTMLElement);
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[nextIndex]?.focus();
  }, []);

  return (
    <div
      {...getFloatingProps()}
      ref={(element) => {
        menuRef.current = element;
        refs.setFloating(element);
      }}
      style={floatingStyles}
      className="scroll-area z-50 flex w-52 flex-col overflow-y-auto rounded-xl border border-node-border bg-surface-overlay p-1 shadow-2xl shadow-black/50"
      role="menu"
      aria-label="Node actions"
      onKeyDown={onKeyDown}
      // Panning the canvas with the menu open must not feel like dragging it.
      onPointerDown={(event) => event.stopPropagation()}
      data-export-ignore
    >
      {actions.map((action, index) => {
        const Icon = action.icon;
        return (
          <button
            key={action.id}
            type="button"
            role="menuitem"
            tabIndex={index === 0 ? 0 : -1}
            disabled={action.isDisabled}
            className={cn(
              'flex min-h-touch-target w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm',
              'transition-colors disabled:cursor-not-allowed disabled:opacity-40',
              action.isDanger
                ? 'text-danger hover:bg-danger-soft'
                : 'text-canvas-muted hover:bg-node-surface-hover hover:text-canvas-text',
            )}
            onClick={() => {
              runAction(action.id);
            }}
          >
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            {action.label}
          </button>
        );
      })}

      <div className="my-1 h-px bg-node-border" role="separator" />

      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        aria-haspopup="menu"
        aria-expanded={isStatusOpen}
        className="flex min-h-touch-target w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-canvas-muted transition-colors hover:bg-node-surface-hover hover:text-canvas-text"
        onClick={() => {
          setIsStatusOpen((open) => !open);
        }}
      >
        {status ? (
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: NODE_STATUS_META[status].color }}
          />
        ) : (
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full border border-current" />
        )}
        <span className="flex-1 truncate">
          {status ? NODE_STATUS_META[status].label : 'Set status'}
        </span>
        <ChevronRight
          aria-hidden="true"
          className={cn('size-4 shrink-0 transition-transform', isStatusOpen && 'rotate-90')}
        />
      </button>

      {isStatusOpen && (
        <div role="menu" aria-label="Node status" className="flex flex-col">
          {status && (
            <StatusOption
              label="No status"
              isSelected={false}
              onSelect={() => {
                updateNodeStatus(nodeId, undefined);
                onClose();
              }}
            />
          )}
          {NODE_STATUS_ORDER.map((option) => (
            <StatusOption
              key={option}
              label={NODE_STATUS_META[option].label}
              color={NODE_STATUS_META[option].color}
              isSelected={option === status}
              onSelect={() => {
                updateNodeStatus(nodeId, option);
                onClose();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface StatusOptionProps {
  label: string;
  color?: string;
  isSelected: boolean;
  onSelect: () => void;
}

function StatusOption({ label, color, isSelected, onSelect }: StatusOptionProps): React.JSX.Element {
  return (
    <button
      type="button"
      role="menuitemradio"
      tabIndex={-1}
      aria-checked={isSelected}
      onClick={onSelect}
      className={cn(
        'flex min-h-touch-target w-full items-center gap-2.5 rounded-lg py-2 pr-3 pl-8 text-left text-sm transition-colors',
        isSelected ? 'bg-node-surface-hover text-canvas-text' : 'text-canvas-muted hover:bg-node-surface-hover hover:text-canvas-text',
      )}
    >
      <span
        aria-hidden="true"
        className="-ml-5 size-2 shrink-0 rounded-full"
        style={
          color
            ? { backgroundColor: color }
            : { boxShadow: 'inset 0 0 0 1px currentColor' }
        }
      />
      {label}
    </button>
  );
}
