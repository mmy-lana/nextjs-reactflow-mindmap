"use client";

import { useCallback, useMemo } from "react";
import { useMindMapStore } from "@/store/useMindMapStore";
import { calculateMindMapLayout } from "@/lib/layoutEngine";
import {
  DEFAULT_LAYOUT_OPTIONS,
  type CanvasEdge,
  type CanvasNode,
  type LayoutDirection,
  type LayoutOptions,
} from "@/types/mindmap";

/**
 * Layout controls for the toolbar.
 *
 * The pure engine is callable on its own, but a preview has to be computed
 * without touching the store, so this hook keeps both entry points: `preview`
 * is side-effect free, `applyLayout` is the committed path that also records
 * history and persists the result.
 */
export interface UseMindMapLayoutResult {
  options: LayoutOptions;
  isRunning: boolean;
  /** Node count of the current canvas, cheap enough to render live. */
  nodeCount: number;
  /** True when a layout pass would actually change the current direction. */
  isCurrentDirection: (direction: LayoutDirection) => boolean;
  /** Computes a layout without committing it. Never mutates the canvas. */
  preview: (options?: Partial<LayoutOptions>) => { nodes: CanvasNode[]; edges: CanvasEdge[] } | null;
  /** Computes and commits a layout, recording one history step. */
  applyLayout: (options?: Partial<LayoutOptions>) => void;
  applyHorizontal: () => void;
  applyRadial: () => void;
  /** Restores the shipped defaults. */
  resetOptions: () => void;
  setSpacing: (spacing: Partial<Pick<LayoutOptions, 'horizontalSpacing' | 'verticalSpacing'>>) => void;
}

export function useMindMapLayout(): UseMindMapLayoutResult {
  const nodes = useMindMapStore((state) => state.nodes);
  const edges = useMindMapStore((state) => state.edges);
  const options = useMindMapStore((state) => state.layoutOptions);
  const isRunning = useMindMapStore((state) => state.isLayoutRunning);
  const applyLayoutToStore = useMindMapStore((state) => state.applyLayout);

  const preview = useCallback(
    (override?: Partial<LayoutOptions>) => {
      if (nodes.length === 0) {
        return null;
      }
      const result = calculateMindMapLayout(nodes, edges, { ...options, ...override });
      return { nodes: result.nodes, edges: result.edges };
    },
    [nodes, edges, options],
  );

  const setSpacing = useCallback(
    (spacing: Partial<Pick<LayoutOptions, 'horizontalSpacing' | 'verticalSpacing'>>) => {
      const next = { ...options, ...spacing };
      // Spacing alone is not a history step: it only takes effect when a layout
      // is applied, and that pass is the recorded, undoable event.
      useMindMapStore.setState({ layoutOptions: next });
    },
    [options],
  );

  const resetOptions = useCallback(() => {
    useMindMapStore.setState({ layoutOptions: { ...DEFAULT_LAYOUT_OPTIONS } });
  }, []);

  return useMemo(
    () => ({
      options,
      isRunning,
      nodeCount: nodes.length,
      isCurrentDirection: (direction: LayoutDirection) => options.direction === direction,
      preview,
      applyLayout: (override) => {
        applyLayoutToStore(override);
      },
      applyHorizontal: () => {
        applyLayoutToStore({ direction: 'HORIZONTAL' });
      },
      applyRadial: () => {
        applyLayoutToStore({ direction: 'RADIAL' });
      },
      resetOptions,
      setSpacing,
    }),
    [options, isRunning, nodes.length, preview, applyLayoutToStore, resetOptions, setSpacing],
  );
}
