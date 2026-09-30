"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FilePlus2, LoaderCircle, Map as MapIcon, Trash2, TriangleAlert } from "lucide-react";
import { deleteDocument, listDocuments } from "@/db/documentRepository";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { createUuid } from "@/lib/nodeFactory";
import { UNNAMED_DOCUMENT_TITLE, type MindMapDocument } from "@/types/mindmap";
import { cn } from "@/lib/cn";

/**
 * The map list.
 *
 * The route is the identifier: opening `/map/<id>` for an id that is not stored
 * yet creates that document, so a new map needs no insert step here. The id is
 * minted on the client for exactly that reason — there is no server to ask.
 *
 * Dates are formatted after the list arrives rather than during the first
 * render, because "2 days ago" computed on a server in one timezone and again in
 * a browser in another is a hydration mismatch.
 */

type LoadState = 'loading' | 'ready' | 'error';

export default function HomePage(): React.JSX.Element {
  const router = useRouter();
  const [maps, setMaps] = useState<MindMapDocument[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [pendingDeletion, setPendingDeletion] = useState<MindMapDocument | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      setMaps(await listDocuments());
      setState('ready');
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message.length > 0
          ? cause.message
          : 'The stored maps could not be read from this browser.',
      );
      setState('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openNewMap = useCallback(() => {
    router.push(`/map/${createUuid()}`);
  }, [router]);

  const confirmDeletion = useCallback(async () => {
    if (!pendingDeletion) {
      return;
    }
    setIsDeleting(true);
    try {
      await deleteDocument(pendingDeletion.id);
      setMaps((current) => current.filter((map) => map.id !== pendingDeletion.id));
      setPendingDeletion(null);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message.length > 0
          ? cause.message
          : 'That map could not be deleted.',
      );
    } finally {
      setIsDeleting(false);
    }
  }, [pendingDeletion]);

  return (
    <main className="min-h-screen bg-canvas-bg">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6">
        <header className="flex flex-col gap-4 border-b border-node-border pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-canvas-text">Mind maps</h1>
            <p className="text-sm text-canvas-muted">
              {state === 'ready'
                ? `${maps.length} ${maps.length === 1 ? 'map' : 'maps'} in this browser`
                : 'Stored in this browser, on this device.'}
            </p>
          </div>
          <Button variant="primary" onClick={openNewMap} className="w-full sm:w-auto">
            <FilePlus2 className="size-4" />
            New map
          </Button>
        </header>

        {error !== null && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger"
          >
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0 flex-1">{error}</span>
          </p>
        )}

        {state === 'loading' ? (
          <p role="status" className="flex items-center gap-2 text-sm text-canvas-muted">
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            Loading your maps
          </p>
        ) : maps.length === 0 ? (
          <EmptyState onCreate={openNewMap} />
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {maps.map((map) => (
              <li key={map.id}>
                <MapCard map={map} onRequestDelete={() => setPendingDeletion(map)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        isOpen={pendingDeletion !== null}
        onClose={() => {
          setPendingDeletion(null);
        }}
        title="Delete this map?"
        description={
          pendingDeletion
            ? `"${pendingDeletion.title.trim() || UNNAMED_DOCUMENT_TITLE}" and its ${
                pendingDeletion.nodeCount
              } ${pendingDeletion.nodeCount === 1 ? 'node' : 'nodes'} are removed from this browser. This cannot be undone.`
            : undefined
        }
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setPendingDeletion(null);
              }}
            >
              Keep it
            </Button>
            <Button variant="danger" isLoading={isDeleting} onClick={() => void confirmDeletion()}>
              <Trash2 className="size-4" />
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-canvas-muted">
          Export the map as JSON first if there is any chance you will want it back.
        </p>
      </Modal>
    </main>
  );
}

interface EmptyStateProps {
  onCreate: () => void;
}

function EmptyState({ onCreate }: EmptyStateProps): React.JSX.Element {
  return (
    <section className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-node-border px-6 py-14 text-center">
      <span
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-full bg-surface-overlay text-canvas-muted"
      >
        <MapIcon className="size-6" />
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium text-canvas-text">No maps yet</h2>
        <p className="max-w-sm text-sm text-canvas-muted">
          A map starts as one idea. Add children to it, and it becomes a structure.
        </p>
      </div>
      <Button variant="primary" onClick={onCreate}>
        <FilePlus2 className="size-4" />
        Create the first map
      </Button>
    </section>
  );
}

interface MapCardProps {
  map: MindMapDocument;
  onRequestDelete: () => void;
}

function MapCard({ map, onRequestDelete }: MapCardProps): React.JSX.Element {
  const title = map.title.trim() || UNNAMED_DOCUMENT_TITLE;

  return (
    <article className="group relative flex h-full flex-col gap-2 rounded-2xl border border-node-border bg-node-surface p-4 transition-colors hover:border-node-border-active">
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 flex-1 truncate text-base font-medium text-canvas-text">
          <Link
            href={`/map/${map.id}`}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            {title}
          </Link>
        </h2>
        {/* Above the card's stretched link, so it stays clickable. */}
        <span className="relative z-10">
          <IconButton
            label={`Delete ${title}`}
            variant="ghost"
            onClick={onRequestDelete}
            className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          >
            <Trash2 className="size-4" />
          </IconButton>
        </span>
      </div>

      {map.description.trim().length > 0 && (
        <p className="line-clamp-2 text-sm text-canvas-muted">{map.description}</p>
      )}

      <p className={cn('mt-auto pt-2 text-xs text-canvas-muted')}>
        {map.nodeCount} {map.nodeCount === 1 ? 'node' : 'nodes'} · edited{' '}
        {formatRelativeTime(map.updatedAt)}
      </p>
    </article>
  );
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * "3 minutes ago" style label.
 *
 * Relative wording beats a date here: the useful question is "did I just do
 * this?", and an absolute date answers it a day later.
 */
function formatRelativeTime(timestamp: number): string {
  const elapsed = Date.now() - timestamp;
  if (!Number.isFinite(elapsed) || elapsed < 0) {
    return 'just now';
  }
  if (elapsed < MINUTE) {
    return 'just now';
  }
  if (elapsed < HOUR) {
    return `${Math.floor(elapsed / MINUTE)} min ago`;
  }
  if (elapsed < DAY) {
    return `${Math.floor(elapsed / HOUR)} h ago`;
  }
  if (elapsed < WEEK) {
    return `${Math.floor(elapsed / DAY)} d ago`;
  }
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
