"use client";

import { useCallback, useEffect, useRef } from "react";
import { useReactFlow } from "@xyflow/react";
import { useMindMapStore, type MindMapStore } from "@/store/useMindMapStore";
import { buildChildIndex, findRootNode, sortSiblingsByOrder } from "@/lib/treeTransforms";
import type { ActiveDrawerType, CanvasEdge, CanvasNode } from "@/types/mindmap";

/**
 * Global keyboard shortcuts for the editor.
 *
 * All shortcuts are dispatched from a single `keydown` listener. Two rules keep
 * the canvas predictable:
 *
 * 1. Nothing fires while the user is typing. A label edit must never be
 *    interrupted by the app-level undo, and the browser's own editing
 *    shortcuts have to keep working, so an editable target opts out entirely.
 * 2. Focus decides ownership. Space and Enter belong to whatever button the
 *    user has tabbed to, and arrow keys belong to a focused list, so those keys
 *    are only claimed when focus is on the canvas itself.
 */

/** A focused control that owns Space, Enter and the arrow keys. */
function isActivatableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.tagName === 'BUTTON' || target.tagName === 'A' || target.tagName === 'SUMMARY') {
    return true;
  }
  if (target.tagName === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    return ['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file'].includes(
      type,
    );
  }
  return target.getAttribute('role') === 'button';
}

/** True when the event target accepts free text, so typing is never hijacked. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  if (target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
    return true;
  }
  return target.tagName === 'INPUT' && !isActivatableTarget(target);
}

/** True when focus sits inside a dialog or menu that owns its own keys. */
function isInsideOverlay(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && Boolean(target.closest('[role="dialog"], [role="menu"]'))
  );
}

export type ShortcutId =
  | 'undo'
  | 'redo'
  | 'addChild'
  | 'addSibling'
  | 'addRootChild'
  | 'delete'
  | 'toggleCollapse'
  | 'editLabel'
  | 'selectParent'
  | 'selectFirstChild'
  | 'fitView'
  | 'toggleInspector'
  | 'toggleOutline'
  | 'toggleShortcuts';

export interface KeyboardShortcut {
  id: ShortcutId;
  /** Machine readable combo, e.g. `mod+shift+z`. */
  combo: string;
  description: string;
  group: 'Edit' | 'Node' | 'View' | 'Panels';
}

/** The single source of truth rendered by the shortcuts dialog. */
export const KEYBOARD_SHORTCUTS: readonly KeyboardShortcut[] = [
  { id: 'undo', combo: 'mod+z', description: 'Undo the last change', group: 'Edit' },
  { id: 'redo', combo: 'mod+shift+z', description: 'Redo the change that was undone', group: 'Edit' },
  { id: 'addChild', combo: 'tab', description: 'Add a child to the selected node', group: 'Node' },
  {
    id: 'addSibling',
    combo: 'mod+enter',
    description: 'Add a sibling next to the selected node',
    group: 'Node',
  },
  {
    id: 'addRootChild',
    combo: 'mod+shift+enter',
    description: 'Add a branch to the map root',
    group: 'Node',
  },
  {
    id: 'delete',
    combo: 'delete',
    description: 'Delete the selected node and its subtree',
    group: 'Node',
  },
  {
    id: 'toggleCollapse',
    combo: 'space',
    description: 'Collapse or expand the selected branch',
    group: 'Node',
  },
  { id: 'editLabel', combo: 'f2', description: 'Rename the selected node', group: 'Node' },
  { id: 'selectParent', combo: 'arrowup', description: 'Select the parent node', group: 'Node' },
  {
    id: 'selectFirstChild',
    combo: 'arrowdown',
    description: 'Select the first child node',
    group: 'Node',
  },
  { id: 'fitView', combo: 'mod+0', description: 'Fit the whole map in view', group: 'View' },
  {
    id: 'toggleInspector',
    combo: 'mod+i',
    description: 'Open or close the node inspector',
    group: 'Panels',
  },
  {
    id: 'toggleOutline',
    combo: 'mod+o',
    description: 'Open or close the map outline',
    group: 'Panels',
  },
  { id: 'toggleShortcuts', combo: '?', description: 'Show every shortcut', group: 'Panels' },
];

/** Renders a combo for display, e.g. `mod+shift+z` becomes "Mod+Shift+Z". */
export function formatShortcut(combo: string): string {
  const labels: Record<string, string> = {
    mod: 'Mod',
    shift: 'Shift',
    alt: 'Alt',
    enter: 'Enter',
    delete: 'Del',
    backspace: 'Backspace',
    space: 'Space',
    tab: 'Tab',
    arrowup: '↑',
    arrowdown: '↓',
    arrowleft: '←',
    arrowright: '→',
  };
  return combo
    .split('+')
    .map((part) => labels[part] ?? part.toUpperCase())
    .join('+');
}

/**
 * True when the event matches a combo such as `mod+shift+z`.
 *
 * Every modifier in the combo must be present and no other modifier may be
 * held, so `mod+z` never fires while Alt is down.
 */
export function matchesShortcut(event: KeyboardEvent, combo: string): boolean {
  const parts = combo.split('+');
  const key = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);

  if (modifiers.includes('mod') !== (event.ctrlKey || event.metaKey)) {
    return false;
  }
  if (modifiers.includes('shift') !== event.shiftKey) {
    return false;
  }
  if (modifiers.includes('alt') !== event.altKey) {
    return false;
  }
  return event.key.toLowerCase() === key;
}

export interface UseKeyboardNavigationOptions {
  /** Opens the shortcuts dialog. */
  onShowShortcuts?: () => void;
  /** Disabled while a document is still hydrating. */
  enabled?: boolean;
}

/** Everything the key handler needs, refreshed on every render. */
interface KeyboardContext {
  enabled: boolean;
  onShowShortcuts: (() => void) | undefined;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  selectedNodeId: string | null;
  activeDrawer: ActiveDrawerType;
  fitView: (options?: { padding?: number; duration?: number }) => void;
  addNode: MindMapStore['addNode'];
  addSibling: MindMapStore['addSibling'];
  deleteSubtree: MindMapStore['deleteSubtree'];
  toggleSubtreeCollapse: MindMapStore['toggleSubtreeCollapse'];
  setSelectedNodeId: MindMapStore['setSelectedNodeId'];
  setEditingNodeId: MindMapStore['setEditingNodeId'];
  setActiveDrawer: MindMapStore['setActiveDrawer'];
  undo: MindMapStore['undo'];
  redo: MindMapStore['redo'];
}

export function useKeyboardNavigation(options: UseKeyboardNavigationOptions = {}): void {
  const { onShowShortcuts, enabled = true } = options;
  const flow = useReactFlow<CanvasNode>();

  const nodes = useMindMapStore((state) => state.nodes);
  const edges = useMindMapStore((state) => state.edges);
  const selectedNodeId = useMindMapStore((state) => state.selectedNodeId);
  const activeDrawer = useMindMapStore((state) => state.activeDrawer);
  const addNode = useMindMapStore((state) => state.addNode);
  const addSibling = useMindMapStore((state) => state.addSibling);
  const deleteSubtree = useMindMapStore((state) => state.deleteSubtree);
  const toggleSubtreeCollapse = useMindMapStore((state) => state.toggleSubtreeCollapse);
  const setSelectedNodeId = useMindMapStore((state) => state.setSelectedNodeId);
  const setEditingNodeId = useMindMapStore((state) => state.setEditingNodeId);
  const setActiveDrawer = useMindMapStore((state) => state.setActiveDrawer);
  const undo = useMindMapStore((state) => state.undo);
  const redo = useMindMapStore((state) => state.redo);

  // The handler closes over the whole canvas, so it is rebuilt constantly. The
  // listener reads a ref instead, which keeps one stable subscription and can
  // never drop a keypress between re-binds.
  const context = useRef<KeyboardContext>({
    enabled: false,
    onShowShortcuts: undefined,
    nodes: [],
    edges: [],
    selectedNodeId: null,
    activeDrawer: null,
    fitView: () => undefined,
    addNode: () => undefined,
    addSibling: () => undefined,
    deleteSubtree: () => undefined,
    toggleSubtreeCollapse: () => undefined,
    setSelectedNodeId: () => undefined,
    setEditingNodeId: () => undefined,
    setActiveDrawer: () => undefined,
    undo: async () => undefined,
    redo: async () => undefined,
  });

  context.current = {
    enabled,
    onShowShortcuts,
    nodes,
    edges,
    selectedNodeId,
    activeDrawer,
    fitView: (viewOptions) => {
      void flow.fitView({ padding: 0.2, duration: 300, ...viewOptions });
    },
    addNode,
    addSibling,
    deleteSubtree,
    toggleSubtreeCollapse,
    setSelectedNodeId,
    setEditingNodeId,
    setActiveDrawer,
    undo,
    redo,
  };

  const handleKeyDown = useCallback((event: KeyboardEvent): void => {
    const ctx = context.current;
    if (!ctx.enabled || event.defaultPrevented || event.isComposing) {
      return;
    }
    // Rule 1: never interrupt typing, and let overlays keep their own keys.
    if (isEditableTarget(event.target) || isInsideOverlay(event.target)) {
      return;
    }

    const mod = event.ctrlKey || event.metaKey;

    if (mod && matchesShortcut(event, 'mod+z')) {
      event.preventDefault();
      void ctx.undo();
      return;
    }
    if (mod && matchesShortcut(event, 'mod+shift+z')) {
      event.preventDefault();
      void ctx.redo();
      return;
    }
    if (mod && matchesShortcut(event, 'mod+0')) {
      event.preventDefault();
      ctx.fitView({ padding: 0.2, duration: 300 });
      return;
    }
    if (mod && matchesShortcut(event, 'mod+i')) {
      event.preventDefault();
      ctx.setActiveDrawer(ctx.activeDrawer === 'inspector' ? null : 'inspector');
      return;
    }
    if (mod && matchesShortcut(event, 'mod+o')) {
      event.preventDefault();
      ctx.setActiveDrawer(ctx.activeDrawer === 'outline' ? null : 'outline');
      return;
    }

    const selected = ctx.selectedNodeId;
    const hasSelection = Boolean(selected) && ctx.nodes.some((node) => node.id === selected);

    if (mod && matchesShortcut(event, 'mod+enter')) {
      if (!hasSelection) {
        return;
      }
      event.preventDefault();
      ctx.addSibling(selected!);
      return;
    }
    if (mod && matchesShortcut(event, 'mod+shift+enter')) {
      event.preventDefault();
      const root = findRootNode(ctx.nodes);
      if (root) {
        ctx.addNode(root.id);
      }
      return;
    }

    if (event.key === '?' || (event.shiftKey && event.key === '/')) {
      event.preventDefault();
      ctx.onShowShortcuts?.();
      return;
    }

    // Rule 2: from here on the keys are single character or navigation keys, so
    // a focused control keeps them.
    if (isActivatableTarget(event.target)) {
      return;
    }

    if (event.key === 'Tab') {
      if (!hasSelection) {
        // With nothing selected the first Tab still moves focus, which is how a
        // keyboard-only user reaches the pane in the first place.
        return;
      }
      event.preventDefault();
      ctx.addNode(selected!);
      return;
    }

    if (!hasSelection) {
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      ctx.deleteSubtree(selected!);
      return;
    }
    if (event.key === ' ') {
      event.preventDefault();
      ctx.toggleSubtreeCollapse(selected!);
      return;
    }
    if (event.key === 'F2') {
      event.preventDefault();
      ctx.setEditingNodeId(selected!);
      return;
    }
    if (event.key === 'ArrowUp') {
      const parentId = ctx.nodes.find((node) => node.id === selected)?.data.parentId;
      if (parentId) {
        event.preventDefault();
        ctx.setSelectedNodeId(parentId);
      }
      return;
    }
    if (event.key === 'ArrowDown') {
      const [firstChild] = sortSiblingsByOrder(
        buildChildIndex(ctx.nodes, ctx.edges).get(selected!) ?? [],
      );
      if (firstChild) {
        event.preventDefault();
        ctx.setSelectedNodeId(firstChild.id);
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
