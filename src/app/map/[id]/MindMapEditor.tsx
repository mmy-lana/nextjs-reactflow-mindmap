"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ReactFlowProvider } from "@xyflow/react";
import { ArrowLeft, LoaderCircle, RotateCw, TriangleAlert } from "lucide-react";
import { useMindMapStore, type SaveStatus } from "@/store/useMindMapStore";
import { useKeyboardNavigation } from "@/hooks/useKeyboardNavigation";
import { useVisualViewport } from "@/hooks/useVisualViewport";
import { MindMapCanvas } from "@/components/canvas/MindMapCanvas";
import { FloatingToolbar } from "@/components/panels/FloatingToolbar";
import { NodeInspectorDrawer } from "@/components/panels/NodeInspectorDrawer";
import { MapTreeOutlineDrawer } from "@/components/panels/MapTreeOutlineDrawer";
import { ExportImportModal } from "@/components/panels/ExportImportModal";
import { KeyboardShortcutsModal } from "@/components/panels/KeyboardShortcutsModal";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { UNNAMED_DOCUMENT_TITLE } from "@/types/mindmap";
import { cn } from "@/lib/cn";

/**
 * The editor screen.
 *
 * The document is loaded here and unloaded on the way out, so a stale map can
 * never flash up under a different route: the store is a single tab wide, and
 * `/map/[id]` is the only thing that fills it.
 *
 * Everything below sits inside the React Flow provider, because the toolbar and
 * the drawers all need the same viewport instance the canvas is drawing into.
 * The node and edge type maps live in `MindMapCanvas` at module scope for the
 * same reason they are not declared here: a fresh object on every render would
 * remount every node on every keystroke.
 */

export interface MindMapEditorProps {
  documentId: string;
}

export default function MindMapEditor({ documentId }: MindMapEditorProps): React.JSX.Element {
  const loadDocument = useMindMapStore((state) => state.loadDocument);
  const clearDocument = useMindMapStore((state) => state.clearDocument);

  useEffect(() => {
    void loadDocument(documentId);
    return () => {
      clearDocument();
    };
  }, [clearDocument, documentId, loadDocument]);

  return (
    <ReactFlowProvider>
      <EditorSurface documentId={documentId} />
    </ReactFlowProvider>
  );
}

interface EditorSurfaceProps {
  documentId: string;
}

function EditorSurface({ documentId }: EditorSurfaceProps): React.JSX.Element {
  const isHydrating = useMindMapStore((state) => state.isHydrating);
  const loadError = useMindMapStore((state) => state.loadError);
  const meta = useMindMapStore((state) => state.meta);
  const nodeCount = useMindMapStore((state) => state.nodes.length);
  const loadDocument = useMindMapStore((state) => state.loadDocument);

  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  const openShortcuts = useCallback(() => {
    setIsShortcutsOpen(true);
  }, []);

  // Disabled while loading so a keypress cannot mutate a map that is still
  // being read out of IndexedDB.
  useKeyboardNavigation({ onShowShortcuts: openShortcuts, enabled: !isHydrating });

  if (loadError !== null) {
    return (
      <main className="flex size-full items-center justify-center bg-canvas-bg p-6">
        <div className="flex w-full max-w-sm flex-col items-start gap-4 rounded-2xl border border-node-border bg-surface-raised p-5">
          <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-full bg-danger-soft text-danger">
            <TriangleAlert className="size-5" />
          </span>
          <h1 className="text-lg font-semibold text-canvas-text">This map did not open</h1>
          <p className="text-sm text-canvas-muted">{loadError}</p>
          <div className="flex w-full gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                void loadDocument(documentId);
              }}
            >
              <RotateCw className="size-4" />
              Try again
            </Button>
            <Link href="/" className="flex-1">
              <Button variant="primary" fullWidth>
                All maps
              </Button>
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (isHydrating || meta === null) {
    return (
      <main
        className="flex size-full items-center justify-center bg-canvas-bg"
        aria-busy="true"
        aria-label="Loading the map"
      >
        <p role="status" className="flex items-center gap-2 text-sm text-canvas-muted">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Opening the map
        </p>
      </main>
    );
  }

  return (
    <div className="relative size-full overflow-hidden bg-canvas-bg">
      <MindMapCanvas />

      <EditorHeader title={meta.title} nodeCount={nodeCount} />

      <FloatingToolbar
        onOpenExport={() => {
          setIsExportOpen(true);
        }}
        onOpenShortcuts={openShortcuts}
      />

      <NodeInspectorDrawer />
      <MapTreeOutlineDrawer />

      <ExportImportModal
        isOpen={isExportOpen}
        onClose={() => {
          setIsExportOpen(false);
        }}
      />
      <KeyboardShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => {
          setIsShortcutsOpen(false);
        }}
      />
    </div>
  );
}

const SAVE_STATUS_META: Record<SaveStatus, { label: string; tone: string }> = {
  idle: { label: '', tone: '' },
  dirty: { label: 'Unsaved changes', tone: 'text-canvas-muted' },
  saving: { label: 'Saving', tone: 'text-canvas-muted' },
  saved: { label: 'Saved', tone: 'text-success' },
  error: { label: 'Save failed', tone: 'text-danger' },
};

interface EditorHeaderProps {
  title: string;
  nodeCount: number;
}

/**
 * The one piece of chrome the canvas needs: a way back to the list, the name of
 * what is open, and whether the last change reached the database.
 *
 * It sits above the canvas but outside it, so it is never part of an SVG export.
 */
function EditorHeader({ title, nodeCount }: EditorHeaderProps): React.JSX.Element {
  const saveStatus = useMindMapStore((state) => state.saveStatus);
  const { isKeyboardOpen } = useVisualViewport();
  const status = SAVE_STATUS_META[saveStatus];

  return (
    <header
      data-export-ignore
      className={cn(
        'pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-2 p-3',
        'transition-opacity duration-200',
        // The header would otherwise cover the node being renamed above the
        // keyboard, which is the whole reason the keyboard moved the canvas.
        isKeyboardOpen && 'opacity-0',
      )}
    >
      <Link href="/" aria-label="Back to all maps" className="pointer-events-auto">
        <IconButton label="Back to all maps" variant="surface">
          <ArrowLeft className="size-5" />
        </IconButton>
      </Link>

      <div className="pointer-events-none flex min-w-0 flex-col gap-0.5 rounded-xl border border-node-border bg-surface-raised/90 px-3 py-1.5 backdrop-blur-md">
        <h1 className="truncate text-sm font-medium text-canvas-text">
          {title.trim() || UNNAMED_DOCUMENT_TITLE}
        </h1>
        <p className="text-xs text-canvas-muted">
          {nodeCount} {nodeCount === 1 ? 'node' : 'nodes'}
          {status.label ? (
            <>
              {' · '}
              <span className={status.tone}>{status.label}</span>
            </>
          ) : null}
        </p>
      </div>
    </header>
  );
}
