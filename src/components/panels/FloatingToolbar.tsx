"use client";

import { useCallback, useState, type ReactNode } from "react";
import {
  Download,
  FilePlus2,
  Keyboard,
  Layout,
  ListTree,
  Maximize,
  Redo2,
  SlidersHorizontal,
  Settings2,
  Undo2,
} from "lucide-react";
import { useReactFlow } from "@xyflow/react";
import { useMindMapStore } from "@/store/useMindMapStore";
import { useCanvasHistory } from "@/hooks/useCanvasHistory";
import { useNodeOperations } from "@/hooks/useNodeOperations";
import { useVisualViewport } from "@/hooks/useVisualViewport";
import { ActionSheet, ActionSheetItem } from "@/components/ui/ActionSheet";
import { LayoutOptionsSheet } from "@/components/panels/LayoutOptionsSheet";
import { cn } from "@/lib/cn";

/**
 * The bottom command bar.
 *
 * Four primary actions is the ceiling: at 360px a fifth button would fall below
 * the 44px touch target minimum, and a bar wider than a thumb can cover is
 * unusable one handed. Everything else lives in the overflow sheet.
 *
 * The bar hides while the software keyboard is open. It is anchored to the
 * bottom edge, so it would otherwise sit on top of the keyboard and of the
 * field being typed into.
 */

/** Widest the bar may grow, which keeps it inside a 430px phone with margins. */
const MAX_BAR_WIDTH_REM = '26.5rem';

interface ToolbarActionProps {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  isActive?: boolean;
  /** Screen reader name; defaults to the visible label. */
  srLabel?: string;
}

function ToolbarAction({
  label,
  icon,
  onClick,
  disabled = false,
  isActive = false,
  srLabel,
}: ToolbarActionProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={srLabel ?? label}
      aria-pressed={isActive ? true : undefined}
      title={label}
      className={cn(
        'flex min-h-touch-target min-w-touch-target flex-1 flex-col items-center justify-center gap-0.5',
        'rounded-xl px-1 text-[11px] leading-tight transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-40',
        isActive
          ? 'bg-accent-soft text-accent'
          : 'text-canvas-muted hover:bg-node-surface-hover hover:text-canvas-text',
      )}
    >
      <span aria-hidden="true" className="flex size-5 items-center justify-center">
        {icon}
      </span>
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}

export interface FloatingToolbarProps {
  /** Opens the export and import modal owned by the editor. */
  onOpenExport: () => void;
  /** Opens the shortcuts modal owned by the editor. */
  onOpenShortcuts: () => void;
}

export function FloatingToolbar({
  onOpenExport,
  onOpenShortcuts,
}: FloatingToolbarProps): React.JSX.Element | null {
  const { isKeyboardOpen } = useVisualViewport();
  const { fitView } = useReactFlow();
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const [isLayoutOpen, setIsLayoutOpen] = useState(false);

  const nodeCount = useMindMapStore((state) => state.nodes.length);
  const rootNodeId = useMindMapStore(
    (state) => state.nodes.find((node) => node.data.depth === 0)?.id ?? null,
  );
  const activeDrawer = useMindMapStore((state) => state.activeDrawer);
  const setActiveDrawer = useMindMapStore((state) => state.setActiveDrawer);
  const { canUndo, undoLabel, canRedo, redoLabel, undo, redo } = useCanvasHistory();
  const { selectedNode, addChild, addSibling } = useNodeOperations();

  const handleAdd = useCallback(() => {
    if (selectedNode) {
      addChild(selectedNode.id);
      return;
    }
    // With nothing selected the useful action is a second top level branch.
    if (rootNodeId) {
      addSibling(rootNodeId);
    }
  }, [selectedNode, addChild, rootNodeId, addSibling]);

  const closeOverflow = useCallback(() => {
    setIsOverflowOpen(false);
  }, []);

  const toggleDrawer = useCallback(
    (drawer: 'inspector' | 'outline') => {
      setActiveDrawer(activeDrawer === drawer ? null : drawer);
      closeOverflow();
    },
    [activeDrawer, setActiveDrawer, closeOverflow],
  );

  if (isKeyboardOpen) {
    return null;
  }

  const hasMap = nodeCount > 0;

  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]"
        data-export-ignore
      >
        <nav
          aria-label="Mind map actions"
          style={{ maxWidth: MAX_BAR_WIDTH_REM }}
          className={cn(
            'animate-pop-in pointer-events-auto flex w-full items-stretch gap-1',
            'rounded-2xl border border-node-border bg-surface-raised/95 p-1.5',
            'shadow-2xl shadow-black/50 backdrop-blur-md',
          )}
        >
          <ToolbarAction
            label="Add"
            srLabel={selectedNode ? 'Add child node' : 'Add top level branch'}
            icon={<FilePlus2 className="size-5" />}
            onClick={handleAdd}
            disabled={!hasMap}
          />
          <ToolbarAction
            label="Layout"
            icon={<Layout className="size-5" />}
            onClick={() => {
              setIsLayoutOpen(true);
            }}
            disabled={!hasMap}
          />
          <ToolbarAction
            label="Undo"
            icon={<Undo2 className="size-5" />}
            onClick={() => {
              void undo();
            }}
            disabled={!canUndo}
            srLabel={undoLabel ? `Undo ${undoLabel}` : 'Undo'}
          />
          <ToolbarAction
            label="More"
            icon={<SlidersHorizontal className="size-5" />}
            onClick={() => {
              setIsOverflowOpen(true);
            }}
            isActive={isOverflowOpen}
            srLabel="More actions"
          />
        </nav>
      </div>

      <ActionSheet
        isOpen={isOverflowOpen}
        onClose={closeOverflow}
        title="More actions"
        description="Everything that does not fit in the toolbar."
      >
        <div className="flex flex-col gap-1">
          <ActionSheetItem
            label="Redo"
            description={redoLabel ? `Reapply ${redoLabel.toLowerCase()}` : 'Nothing to redo yet'}
            icon={<Redo2 className="size-4" />}
            disabled={!canRedo}
            onSelect={() => {
              void redo();
              closeOverflow();
            }}
          />
          <ActionSheetItem
            label="Node inspector"
            description="Label, notes, status, tags and style of the selected node"
            icon={<Settings2 className="size-4" />}
            isActive={activeDrawer === 'inspector'}
            onSelect={() => {
              toggleDrawer('inspector');
            }}
          />
          <ActionSheetItem
            label="Map outline"
            description="The whole tree as a collapsible list"
            icon={<ListTree className="size-4" />}
            isActive={activeDrawer === 'outline'}
            onSelect={() => {
              toggleDrawer('outline');
            }}
          />
          <ActionSheetItem
            label="Export and import"
            description="JSON round trip, or a snapshot as SVG"
            icon={<Download className="size-4" />}
            onSelect={() => {
              closeOverflow();
              onOpenExport();
            }}
          />
          <ActionSheetItem
            label="Fit view"
            description="Frame the whole map"
            icon={<Maximize className="size-4" />}
            onSelect={() => {
              closeOverflow();
              void fitView({ padding: 0.2, maxZoom: 1 });
            }}
          />
          <ActionSheetItem
            label="Keyboard shortcuts"
            description="Every command on this map"
            icon={<Keyboard className="size-4" />}
            onSelect={() => {
              closeOverflow();
              onOpenShortcuts();
            }}
          />
        </div>
      </ActionSheet>

      <LayoutOptionsSheet isOpen={isLayoutOpen} onClose={() => setIsLayoutOpen(false)} />
    </>
  );
}
