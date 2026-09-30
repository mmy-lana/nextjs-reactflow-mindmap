"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardCopy,
  FileDown,
  FileUp,
  ImageDown,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { useMindMapStore } from "@/store/useMindMapStore";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { createUuid } from "@/lib/nodeFactory";
import { saveDocumentSerialized } from "@/db/documentRepository";
import {
  ExportError,
  buildFileName,
  downloadFile,
  exportToJson,
  exportToSvg,
  importFromJson,
  type ImportedMindMap,
} from "@/lib/exportEngine";
import {
  MINDMAP_SCHEMA_VERSION,
  UNNAMED_DOCUMENT_TITLE,
  type MindMapDocument,
} from "@/types/mindmap";
import { cn } from "@/lib/cn";

/**
 * Moving a map in and out of the browser.
 *
 * Everything lives in IndexedDB, which is one browser profile on one machine.
 * The JSON file is the only way to move a map somewhere else, back it up or hand
 * it to somebody; the SVG is the only way to put one in a document.
 *
 * Import is offered two ways on purpose. Replacing is what somebody reopening
 * their own backup wants, and it is a single undo step. Creating a new map is
 * what somebody opening a colleague's file wants, and it leaves the current map
 * untouched. The parsed file is held between the two, so the choice is made with
 * the title and node count on screen rather than blind.
 */

const JSON_MIME_TYPE = 'application/json';
const SVG_MIME_TYPE = 'image/svg+xml';

/** Selects the rendered pane. `MindMapCanvas` marks its root for this. */
const CANVAS_SELECTOR = '[data-canvas-root] .react-flow';

export interface ExportImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** What the modal is doing right now, so the right button shows progress. */
type PendingAction = 'svg' | 'copy' | 'replace' | 'new' | null;

export function ExportImportModal({ isOpen, onClose }: ExportImportModalProps): React.JSX.Element {
  const router = useRouter();
  const nodes = useMindMapStore((state) => state.nodes);
  const edges = useMindMapStore((state) => state.edges);
  const meta = useMindMapStore((state) => state.meta);
  const replaceCanvas = useMindMapStore((state) => state.replaceCanvas);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [staged, setStaged] = useState<ImportedMindMap | null>(null);

  const reset = useCallback(() => {
    setPending(null);
    setError(null);
    setNotice(null);
    setStaged(null);
  }, []);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const title = meta?.title ?? UNNAMED_DOCUMENT_TITLE;
  const hasNodes = nodes.length > 0;

  const runExportJson = useCallback(() => {
    if (!meta) {
      return;
    }
    try {
      const json = exportToJson(nodes, edges, meta);
      downloadFile(buildFileName(title, 'json'), json, JSON_MIME_TYPE);
      setError(null);
      setNotice(`Exported ${nodes.length} ${nodes.length === 1 ? 'node' : 'nodes'} as JSON.`);
    } catch (cause) {
      setNotice(null);
      setError(describeError(cause));
    }
  }, [edges, meta, nodes, title]);

  const runExportSvg = useCallback(async () => {
    setPending('svg');
    setError(null);
    setNotice(null);
    try {
      const pane = document.querySelector<HTMLElement>(CANVAS_SELECTOR);
      if (!pane) {
        throw new ExportError('render_failed', 'The canvas is not on screen yet.');
      }
      const svg = await exportToSvg(pane, title);
      downloadFile(buildFileName(title, 'svg'), svg, SVG_MIME_TYPE);
      setNotice('Exported the current view as an SVG snapshot.');
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setPending(null);
    }
  }, [title]);

  const runCopyJson = useCallback(async () => {
    if (!meta) {
      return;
    }
    setPending('copy');
    setError(null);
    setNotice(null);
    try {
      const json = exportToJson(nodes, edges, meta);
      await navigator.clipboard.writeText(json);
      setNotice('JSON copied to the clipboard.');
    } catch {
      setError('The browser refused clipboard access. Use Download JSON instead.');
    } finally {
      setPending(null);
    }
  }, [edges, meta, nodes]);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setNotice(null);
    setStaged(null);
    try {
      setStaged(importFromJson(await file.text()));
    } catch (cause) {
      setError(describeError(cause));
    }
  }, []);

  const importAsNewMap = useCallback(async () => {
    if (!staged) {
      return;
    }
    setPending('new');
    setError(null);
    try {
      const now = Date.now();
      const id = createUuid();
      const newMeta: MindMapDocument = {
        id,
        title: staged.title.trim() || UNNAMED_DOCUMENT_TITLE,
        description: staged.description,
        createdAt: now,
        updatedAt: now,
        nodeCount: staged.nodes.length,
        // A fresh map has never been panned, so it opens fitted rather than at
        // an offset nobody chose.
        viewport: { x: 0, y: 0, zoom: 1 },
        tags: [...staged.tags],
        // The file's edges are wired for the file's layout, so the layout has to
        // travel with them or the new map renders with unreachable edges.
        ...(staged.layoutOptions === undefined ? {} : { layoutOptions: staged.layoutOptions }),
      };
      await saveDocumentSerialized(id, {
        version: MINDMAP_SCHEMA_VERSION,
        meta: newMeta,
        nodes: staged.nodes,
        edges: staged.edges,
      });
      reset();
      onClose();
      router.push(`/map/${id}`);
    } catch (cause) {
      setError(describeError(cause));
      setPending(null);
    }
  }, [onClose, reset, router, staged]);

  const importOverCurrentMap = useCallback(() => {
    if (!staged) {
      return;
    }
    replaceCanvas(
      staged.nodes,
      staged.edges,
      staged.description,
      staged.title,
      staged.layoutOptions,
    );
    reset();
    onClose();
  }, [onClose, replaceCanvas, reset, staged]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title="Export and import"
      description={`${nodes.length} ${nodes.length === 1 ? 'node' : 'nodes'} in "${title}".`}
      size="md"
      footer={
        <Button variant="ghost" onClick={close}>
          Close
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        <section className="flex flex-col gap-3">
          <SectionTitle icon={<FileDown className="size-4" />} title="Export" />
          <Button
            variant="secondary"
            fullWidth
            disabled={meta === null}
            onClick={runExportJson}
            className="justify-start"
          >
            <FileDown className="size-4" />
            <span className="flex flex-col items-start">
              <span>Download JSON</span>
              <span className="text-xs text-canvas-muted">
                Every node, edge and note. Re-importable.
              </span>
            </span>
          </Button>
          <Button
            variant="secondary"
            fullWidth
            disabled={!hasNodes}
            isLoading={pending === 'svg'}
            onClick={() => {
              void runExportSvg();
            }}
            className="justify-start"
          >
            <ImageDown className="size-4" />
            <span className="flex flex-col items-start">
              <span>Download SVG snapshot</span>
              <span className="text-xs text-canvas-muted">
                What is on screen right now, at screen size.
              </span>
            </span>
          </Button>
          <Button
            variant="secondary"
            fullWidth
            disabled={meta === null}
            isLoading={pending === 'copy'}
            onClick={() => {
              void runCopyJson();
            }}
            className="justify-start"
          >
            <ClipboardCopy className="size-4" />
            <span className="flex flex-col items-start">
              <span>Copy JSON</span>
              <span className="text-xs text-canvas-muted">For pasting into a ticket.</span>
            </span>
          </Button>
        </section>

        <section className="flex flex-col gap-3">
          <SectionTitle icon={<FileUp className="size-4" />} title="Import" />
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            aria-label="Choose a mind map JSON file"
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Cleared first, so picking the same file twice still fires a change.
              event.target.value = '';
              if (file) {
                void handleFile(file);
              }
            }}
          />
          <Button
            variant="primary"
            fullWidth
            onClick={() => {
              fileInputRef.current?.click();
            }}
          >
            <Upload className="size-4" />
            Choose a JSON file
          </Button>

          {staged !== null && (
            <div className="flex flex-col gap-3 rounded-xl border border-node-border bg-node-surface p-3">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-canvas-text">{staged.title}</p>
                <p className="text-xs text-canvas-muted">
                  {staged.sourceNodeCount}{' '}
                  {staged.sourceNodeCount === 1 ? 'node' : 'nodes'}
                  {staged.description ? ` · ${staged.description}` : ''}
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="primary"
                  isLoading={pending === 'new'}
                  onClick={() => {
                    void importAsNewMap();
                  }}
                  className="flex-1"
                >
                  Open as a new map
                </Button>
                <Button
                  variant="secondary"
                  isLoading={pending === 'replace'}
                  onClick={importOverCurrentMap}
                  className="flex-1"
                >
                  Replace this map
                </Button>
              </div>
              <p className="text-xs text-canvas-muted">
                Replacing overwrites the current map in one undo step. Opening as a new map
                leaves this one alone.
              </p>
            </div>
          )}
        </section>

        {error !== null && <StatusLine tone="error" message={error} />}
        {notice !== null && <StatusLine tone="info" message={notice} />}
      </div>
    </Modal>
  );
}

interface SectionTitleProps {
  icon: ReactNode;
  title: string;
}

function SectionTitle({ icon, title }: SectionTitleProps): React.JSX.Element {
  return (
    <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-canvas-muted uppercase">
      <span aria-hidden="true">{icon}</span>
      {title}
    </h3>
  );
}

interface StatusLineProps {
  tone: 'error' | 'info';
  message: string;
}

function StatusLine({ tone, message }: StatusLineProps): React.JSX.Element {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-xl px-3 py-2 text-sm',
        tone === 'error' ? 'bg-danger-soft text-danger' : 'bg-accent-soft text-canvas-text',
      )}
    >
      {tone === 'error' && (
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      )}
      <span className="min-w-0 flex-1">{message}</span>
    </p>
  );
}

/** Turns any thrown value into a sentence fit for the status line. */
function describeError(cause: unknown): string {
  if (cause instanceof ExportError) {
    return cause.message;
  }
  if (cause instanceof Error && cause.message.length > 0) {
    return cause.message;
  }
  return 'Something went wrong and the file was not read.';
}
