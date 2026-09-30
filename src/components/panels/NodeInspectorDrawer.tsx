"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { FileText, Hash, Palette, Trash2, Waypoints } from "lucide-react";
import { useMindMapStore } from "@/store/useMindMapStore";
import { useNodeOperations } from "@/hooks/useNodeOperations";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { NodeStatusBadge } from "@/components/nodes/parts/NodeStatusBadge";
import {
  NODE_STATUS_META,
  NODE_STATUS_ORDER,
  UNNAMED_NODE_LABEL,
  type NodeDirection,
  type NodeFontWeight,
  type NodeShape,
  type NodeStatus,
} from "@/types/mindmap";
import { cn } from "@/lib/cn";

/**
 * Everything about the selected node that does not fit on the node itself.
 *
 * The fields commit on blur rather than on every keystroke. A mind map edit is a
 * document edit, and the store records one undo step per commit: writing through
 * on each keystroke would fill the fifty entry history with a single sentence.
 * The local draft also means a half typed label survives closing the drawer.
 */

const TAG_SEPARATOR = /[,;\n]/;

const DIRECTION_OPTIONS: ReadonlyArray<{ value: NodeDirection; label: string }> = [
  { value: 'RIGHT', label: 'Right' },
  { value: 'LEFT', label: 'Left' },
];

const SHAPE_OPTIONS: ReadonlyArray<{ value: NodeShape; label: string }> = [
  { value: 'rounded', label: 'Rounded' },
  { value: 'rectangle', label: 'Square' },
  { value: 'pill', label: 'Pill' },
  { value: 'underline', label: 'Underline' },
];

const WEIGHT_OPTIONS: ReadonlyArray<{ value: NodeFontWeight; label: string }> = [
  { value: 'normal', label: 'Regular' },
  { value: 'medium', label: 'Medium' },
  { value: 'semibold', label: 'Semibold' },
  { value: 'bold', label: 'Bold' },
];

const MIN_FONT_SIZE = 11;
const MAX_FONT_SIZE = 28;

const RANGE_CLASS =
  'h-touch-target w-full cursor-pointer appearance-none bg-transparent ' +
  '[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-node-border ' +
  '[&::-webkit-slider-thumb]:mt-[-7px] [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent ' +
  '[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-node-border ' +
  '[&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-accent';

const INPUT_CLASS =
  'w-full rounded-lg border border-node-border bg-node-surface px-3 text-sm text-canvas-text outline-none transition-colors focus-visible:border-accent';

export function NodeInspectorDrawer(): React.JSX.Element {
  const activeDrawer = useMindMapStore((state) => state.activeDrawer);
  const setActiveDrawer = useMindMapStore((state) => state.setActiveDrawer);
  const meta = useMindMapStore((state) => state.meta);
  const nodeCount = useMindMapStore((state) => state.nodes.length);
  const renameDocument = useMindMapStore((state) => state.renameDocument);
  const updateDocumentDescription = useMindMapStore((state) => state.updateDocumentDescription);
  const setNodeDirection = useMindMapStore((state) => state.setNodeDirection);
  const updateNodeStyle = useMindMapStore((state) => state.updateNodeStyle);
  const selectNode = useMindMapStore((state) => state.setSelectedNodeId);

  const {
    selectedNode,
    selectedChildren,
    selectedSubtreeSize,
    renameNode,
    setNotes,
    setStatus,
    setTags,
    removeNode,
  } = useNodeOperations();

  const isOpen = activeDrawer === 'inspector';

  return (
    <Drawer
      isOpen={isOpen}
      onClose={() => setActiveDrawer(null)}
      title="Inspector"
      description={selectedNode ? 'The selected node and this map.' : 'The map itself.'}
      offsetForToolbar
    >
      <div className="flex flex-col gap-7">
        <section className="flex flex-col gap-3">
          <SectionHeading icon={<Hash className="size-4" />} title="Map" />
          <Field label="Title">
            <DraftField
              value={meta?.title ?? ''}
              placeholder={UNNAMED_NODE_LABEL}
              onCommit={renameDocument}
            />
          </Field>
          <Field label="Description">
            <DraftField
              value={meta?.description ?? ''}
              rows={2}
              placeholder="What is this map for?"
              onCommit={updateDocumentDescription}
            />
          </Field>
        </section>

        {selectedNode === null ? (
          <section className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-node-border p-4">
            <p className="text-sm font-medium text-canvas-text">No node selected</p>
            <p className="text-sm text-canvas-muted">
              Tap a node on the map to edit its label, notes, status and appearance. The map
              settings above work without a selection.
            </p>
            {nodeCount === 0 && (
              <p className="text-sm text-canvas-muted">
                This map is empty. Use Add in the toolbar to give it a first idea.
              </p>
            )}
          </section>
        ) : (
          <>
            <section className="flex flex-col gap-3">
              <SectionHeading icon={<FileText className="size-4" />} title="Node" />
              <Field label="Label">
                <DraftField
                  // Remounting per node is what clears a draft when the selection
                  // moves to a different node.
                  key={`label-${selectedNode.id}`}
                  value={selectedNode.data.label}
                  placeholder={UNNAMED_NODE_LABEL}
                  onCommit={(value) => {
                    renameNode(selectedNode.id, value);
                  }}
                />
              </Field>

              <Field label="Notes">
                <DraftField
                  key={`notes-${selectedNode.id}`}
                  value={selectedNode.data.notes ?? ''}
                  rows={4}
                  placeholder="Anything worth remembering about this idea."
                  onCommit={(value) => {
                    setNotes(selectedNode.id, value);
                  }}
                />
              </Field>

              <Field label="Tags" hint="Separate with a comma.">
                <DraftField
                  key={`tags-${selectedNode.id}`}
                  value={selectedNode.data.tags.join(', ')}
                  placeholder="research, draft"
                  onCommit={(value) => {
                    setTags(
                      selectedNode.id,
                      value
                        .split(TAG_SEPARATOR)
                        .map((tag) => tag.trim())
                        .filter((tag) => tag.length > 0),
                    );
                  }}
                />
              </Field>
            </section>

            <section className="flex flex-col gap-3">
              <SectionHeading icon={<Palette className="size-4" />} title="Appearance" />
              <Field label="Status">
                <div className="flex flex-wrap gap-2">
                  <StatusChip
                    label="None"
                    isSelected={selectedNode.data.status === undefined}
                    onSelect={() => {
                      setStatus(selectedNode.id, undefined);
                    }}
                  />
                  {NODE_STATUS_ORDER.map((option) => (
                    <StatusChip
                      key={option}
                      label={NODE_STATUS_META[option].label}
                      color={NODE_STATUS_META[option].color}
                      isSelected={selectedNode.data.status === option}
                      onSelect={() => {
                        setStatus(selectedNode.id, option);
                      }}
                    />
                  ))}
                </div>
              </Field>

              {selectedNode.data.depth > 0 && (
                <Field label="Branch side" hint="Takes effect on the next layout pass.">
                  <SegmentedGroup
                    options={DIRECTION_OPTIONS}
                    isSelected={(value) => selectedNode.data.direction === value}
                    onSelect={(value) => {
                      setNodeDirection(selectedNode.id, value);
                    }}
                  />
                </Field>
              )}

              <Field label="Shape">
                <SegmentedGroup
                  options={SHAPE_OPTIONS}
                  isSelected={(value) => selectedNode.data.style.shape === value}
                  onSelect={(value) => {
                    updateNodeStyle(selectedNode.id, { shape: value });
                  }}
                />
              </Field>

              <Field label="Text weight">
                <SegmentedGroup
                  options={WEIGHT_OPTIONS}
                  isSelected={(value) => selectedNode.data.style.fontWeight === value}
                  onSelect={(value) => {
                    updateNodeStyle(selectedNode.id, { fontWeight: value });
                  }}
                />
              </Field>

              <Field label="Text size" hint={`${selectedNode.data.style.fontSize}px`}>
                <DraftRange
                  value={selectedNode.data.style.fontSize}
                  min={MIN_FONT_SIZE}
                  max={MAX_FONT_SIZE}
                  onCommit={(fontSize) => {
                    updateNodeStyle(selectedNode.id, { fontSize });
                  }}
                />
              </Field>
            </section>

            <section className="flex flex-col gap-3">
              <SectionHeading
                icon={<Waypoints className="size-4" />}
                title={`Branch · ${selectedSubtreeSize} ${selectedSubtreeSize === 1 ? 'node' : 'nodes'}`}
              />
              {selectedChildren.length > 0 ? (
                <ul className="flex flex-col gap-0.5">
                  {selectedChildren.map((child) => (
                    <li key={child.id}>
                      <button
                        type="button"
                        onClick={() => {
                          selectNode(child.id);
                        }}
                        className="flex min-h-touch-target w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-canvas-muted transition-colors hover:bg-node-surface-hover hover:text-canvas-text"
                      >
                        <span
                          aria-hidden="true"
                          className="size-1.5 shrink-0 rounded-full bg-node-border"
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {child.data.label.trim() || UNNAMED_NODE_LABEL}
                        </span>
                        <NodeStatusBadge status={child.data.status} compact />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-canvas-muted">
                  This node is a leaf. Adding a child grows a branch from it.
                </p>
              )}

              {selectedNode.data.depth > 0 && (
                <Button
                  variant="danger"
                  fullWidth
                  onClick={() => {
                    removeNode(selectedNode.id);
                    setActiveDrawer(null);
                  }}
                >
                  <Trash2 className="size-4" />
                  Delete{' '}
                  {selectedSubtreeSize > 1 ? `branch of ${selectedSubtreeSize} nodes` : 'node'}
                </Button>
              )}
            </section>
          </>
        )}
      </div>
    </Drawer>
  );
}

/* ------------------------------------------------------------------ fields */

interface DraftFieldProps {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  /** Renders a textarea when set. */
  rows?: number;
  id?: string;
}

/**
 * A controlled field that only writes through on blur.
 *
 * The draft is resynced from the store when the field is not focused, so an undo
 * performed elsewhere in the app still shows up here.
 */
function DraftField({ value, onCommit, placeholder, rows, id }: DraftFieldProps): React.JSX.Element {
  const [draft, setDraft] = useState(value);
  const isFocused = useRef(false);

  useEffect(() => {
    if (!isFocused.current) {
      setDraft(value);
    }
  }, [value]);

  const commit = useCallback(() => {
    if (draft !== value) {
      onCommit(draft);
    }
  }, [draft, value, onCommit]);

  if (rows !== undefined) {
    return (
      <textarea
        id={id}
        rows={rows}
        value={draft}
        placeholder={placeholder}
        onFocus={() => {
          isFocused.current = true;
        }}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onBlur={() => {
          isFocused.current = false;
          commit();
        }}
        className={cn(INPUT_CLASS, 'resize-y py-2')}
      />
    );
  }

  return (
    <input
      id={id}
      type="text"
      value={draft}
      placeholder={placeholder}
      enterKeyHint="done"
      onFocus={() => {
        isFocused.current = true;
      }}
      onChange={(event) => {
        setDraft(event.target.value);
      }}
      // Enter is a commit, not a newline, in a single line field.
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      onBlur={() => {
        isFocused.current = false;
        commit();
      }}
      className={cn(INPUT_CLASS, 'min-h-touch-target')}
    />
  );
}

interface DraftRangeProps {
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
}

/**
 * A range input that commits when the gesture ends.
 *
 * A slider produces a change event per pixel of travel; recording each one would
 * make the undo stack unreadable, so the value is committed on release and on
 * keyboard changes.
 */
function DraftRange({ value, min, max, onCommit }: DraftRangeProps): React.JSX.Element {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <input
      type="range"
      min={min}
      max={max}
      step={1}
      value={draft}
      onChange={(event) => {
        setDraft(Number(event.target.value));
      }}
      onPointerUp={() => {
        if (draft !== value) {
          onCommit(draft);
        }
      }}
      onKeyUp={() => {
        if (draft !== value) {
          onCommit(draft);
        }
      }}
      onBlur={() => {
        if (draft !== value) {
          onCommit(draft);
        }
      }}
      className={RANGE_CLASS}
    />
  );
}

interface SegmentedGroupProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string }>;
  isSelected: (value: T) => boolean;
  onSelect: (value: T) => void;
}

/** A small group of mutually exclusive choices, one history step per tap. */
function SegmentedGroup<T extends string>({
  options,
  isSelected,
  onSelect,
}: SegmentedGroupProps<T>): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Button
          key={option.value}
          size="sm"
          variant={isSelected(option.value) ? 'primary' : 'secondary'}
          aria-pressed={isSelected(option.value)}
          onClick={() => {
            onSelect(option.value);
          }}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

interface SectionHeadingProps {
  icon: ReactNode;
  title: string;
}

function SectionHeading({ icon, title }: SectionHeadingProps): React.JSX.Element {
  return (
    <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-canvas-muted uppercase">
      <span aria-hidden="true">{icon}</span>
      {title}
    </h3>
  );
}

interface FieldProps {
  label: string;
  hint?: string;
  children: ReactNode;
}

function Field({ label, hint, children }: FieldProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-canvas-muted">{label}</span>
      {children}
      {hint ? <span className="text-xs text-canvas-muted/80">{hint}</span> : null}
    </div>
  );
}

interface StatusChipProps {
  label: string;
  color?: string;
  isSelected: boolean;
  onSelect: () => void;
}

function StatusChip({ label, color, isSelected, onSelect }: StatusChipProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      className={cn(
        'min-h-touch-target rounded-full border px-3 text-sm transition-colors',
        isSelected
          ? 'border-accent bg-accent-soft text-canvas-text'
          : 'border-node-border text-canvas-muted hover:bg-node-surface-hover',
      )}
    >
      <span className="flex items-center gap-1.5">
        {color ? (
          <span
            aria-hidden="true"
            className="size-2 rounded-full"
            style={{ backgroundColor: color }}
          />
        ) : null}
        {label}
      </span>
    </button>
  );
}
