"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useVisualViewport } from "@/hooks/useVisualViewport";
import { UNNAMED_NODE_LABEL, type NodeFontWeight } from "@/types/mindmap";
import { cn } from "@/lib/cn";

/**
 * A node label that turns into a text field on demand.
 *
 * Editing is driven by the store's `editingNodeId` rather than local state, so a
 * keyboard shortcut, a menu item and a double tap all open the same field.
 *
 * The two things that make inline editing unpleasant on a phone are handled
 * here: React Flow would otherwise start dragging the node out from under the
 * caret (the field carries `nodrag`), and the soft keyboard would cover the very
 * node being edited (the field scrolls itself into the remaining space).
 */

export interface InlineTextEditorProps {
  nodeId: string;
  value: string;
  /** Receives the new label; the store trims and rejects an empty result. */
  onCommit: (nodeId: string, label: string) => void;
  /** Mirrors the node's own typography. */
  fontSize: number;
  fontWeight: NodeFontWeight;
  textColor: string;
  className?: string;
  /** Accessible name, e.g. "Node label". */
  ariaLabel: string;
  /** Centre of the node in flow coordinates, for the keyboard aware scroll. */
  centerX: number;
  centerY: number;
  /** True while this node is the one being renamed. */
  isEditing: boolean;
  /** Leaves the editing state; the field has already committed. */
  onEditingChange: (editing: boolean) => void;
}

const FONT_WEIGHT_CLASS: Readonly<Record<NodeFontWeight, string>> = {
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
};

export function InlineTextEditor(props: InlineTextEditorProps): React.JSX.Element {
  const { value, isEditing } = props;
  const displayValue = value.trim().length > 0 ? value : UNNAMED_NODE_LABEL;

  if (isEditing) {
    return <InlineTextInput {...props} isEditing />;
  }

  return (
    <span
      className={cn('block truncate', FONT_WEIGHT_CLASS[props.fontWeight], props.className)}
      style={{ fontSize: props.fontSize, color: props.textColor }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        props.onEditingChange(true);
      }}
    >
      {displayValue}
    </span>
  );
}

interface InlineTextInputProps extends InlineTextEditorProps {
  /** Always true here; the component only exists while editing. */
  isEditing: true;
}

/**
 * The text field itself.
 *
 * Mounted only while editing, which is what keeps the viewport subscription
 * below from existing once per node on the canvas.
 */
function InlineTextInput({
  nodeId,
  value,
  onCommit,
  fontSize,
  fontWeight,
  textColor,
  className,
  ariaLabel,
  centerX,
  centerY,
  onEditingChange,
}: InlineTextInputProps): React.JSX.Element {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const { setCenter, getZoom } = useReactFlow();
  const { isKeyboardOpen, height, windowHeight } = useVisualViewport();

  // The field is remounted per edit session, so the draft starts from the label
  // the node had when editing began and never follows external updates.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) {
      return;
    }
    input.focus();
    input.select();
  }, []);

  /**
   * Brings the node into the band the keyboard left free.
   *
   * `setCenter` aims at the middle of the pane, which the keyboard then covers,
   * so the target is shifted up by half of whatever the keyboard is hiding.
   */
  const revealNode = useCallback(() => {
    const occluded = isKeyboardOpen ? Math.max(windowHeight - height, 0) : 0;
    setCenter(centerX, centerY - occluded / 2 / getZoom(), { duration: 300 });
  }, [centerX, centerY, isKeyboardOpen, windowHeight, height, setCenter, getZoom]);

  useEffect(() => {
    // The keyboard animates open after the focus event, so the first read is
    // still the full height; one frame plus the animation gets the settled one.
    let timer: number | undefined;
    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(revealNode, 120);
    });
    return () => {
      cancelAnimationFrame(frame);
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [revealNode]);

  const commit = useCallback(() => {
    if (draft !== value) {
      onCommit(nodeId, draft);
    }
    onEditingChange(false);
  }, [draft, value, nodeId, onCommit, onEditingChange]);

  const cancel = useCallback(() => {
    setDraft(value);
    onEditingChange(false);
  }, [value, onEditingChange]);

  return (
    <input
      ref={inputRef}
      // `nodrag` keeps React Flow from stealing the pointer for a node drag.
      className={cn(
        'nodrag nopan w-full min-w-0 rounded-md border border-accent bg-node-surface px-2 py-1 outline-none',
        FONT_WEIGHT_CLASS[fontWeight],
        className,
      )}
      style={{ fontSize, color: textColor }}
      value={draft}
      aria-label={ariaLabel}
      // A virtual keyboard with a smaller key set than a physical one.
      inputMode="text"
      autoComplete="off"
      autoCorrect="on"
      spellCheck
      enterKeyHint="done"
      onChange={(event) => {
        setDraft(event.target.value);
      }}
      onKeyDown={(event) => {
        // The global dispatcher ignores editable targets already; the stop also
        // covers a listener added between here and the window.
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          cancel();
        }
      }}
      onBlur={commit}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    />
  );
}
