"use client";

import { useMemo } from "react";
import { useMindMapStore } from "@/store/useMindMapStore";
import { MAX_HISTORY_ENTRIES } from "@/types/mindmap";

/**
 * Undo/redo surface for the toolbar and the shortcuts dialog.
 *
 * The history itself lives in the store; this hook only exposes whether a step
 * is available and what the two buttons would do, which is what the UI needs to
 * render correct disabled states and accessible labels.
 */
export interface UseCanvasHistoryResult {
  canUndo: boolean;
  canRedo: boolean;
  /** Label of the step undo would revert, e.g. "Rename Node". */
  undoLabel: string | null;
  /** Label of the step redo would re-apply. */
  redoLabel: string | null;
  /** Number of entries currently retained. */
  entryCount: number;
  /** Ceiling on retained entries, surfaced in the shortcuts dialog. */
  limit: number;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

export function useCanvasHistory(): UseCanvasHistoryResult {
  const history = useMindMapStore((state) => state.history);
  const historyIndex = useMindMapStore((state) => state.historyIndex);
  const undoAction = useMindMapStore((state) => state.undo);
  const redoAction = useMindMapStore((state) => state.redo);

  // Derived from the same values the store actions guard on, so a button can
  // never offer a step the action would reject.
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  return useMemo(
    () => ({
      canUndo,
      canRedo,
      undoLabel: canUndo ? (history[historyIndex]?.description ?? null) : null,
      redoLabel: canRedo ? (history[historyIndex + 1]?.description ?? null) : null,
      entryCount: history.length,
      limit: MAX_HISTORY_ENTRIES,
      undo: undoAction,
      redo: redoAction,
    }),
    [canUndo, canRedo, history, historyIndex, undoAction, redoAction],
  );
}
