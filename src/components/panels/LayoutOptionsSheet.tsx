"use client";

import { useCallback } from "react";
import { RotateCcw, Sparkles } from "lucide-react";
import { useMindMapLayout } from "@/hooks/useMindMapLayout";
import { ActionSheet } from "@/components/ui/ActionSheet";
import { Button } from "@/components/ui/Button";
import { DEFAULT_LAYOUT_OPTIONS, type LayoutDirection } from "@/types/mindmap";
import { cn } from "@/lib/cn";

/**
 * Layout direction and spacing.
 *
 * Sliders only change the pending options; nothing moves until Apply is pressed,
 * so dragging a slider cannot push the map around under the user's finger. Apply
 * is the single recorded history step.
 */

const HORIZONTAL_MIN = 200;
const HORIZONTAL_MAX = 520;
const HORIZONTAL_STEP = 10;

const VERTICAL_MIN = 8;
const VERTICAL_MAX = 96;
const VERTICAL_STEP = 4;

const DIRECTION_OPTIONS: ReadonlyArray<{
  value: LayoutDirection;
  label: string;
  description: string;
}> = [
  {
    value: 'HORIZONTAL',
    label: 'Horizontal',
    description: 'Branches fan out to the left and right of the root.',
  },
  {
    value: 'RADIAL',
    label: 'Radial',
    description: 'The root sits in the middle and branches grow in every direction.',
  },
];

export interface LayoutOptionsSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LayoutOptionsSheet({ isOpen, onClose }: LayoutOptionsSheetProps): React.JSX.Element {
  const {
    options,
    isRunning,
    nodeCount,
    isCurrentDirection,
    applyLayout,
    resetOptions,
    setSpacing,
  } = useMindMapLayout();

  const applyAndClose = useCallback(() => {
    applyLayout();
    onClose();
  }, [applyLayout, onClose]);

  return (
    <ActionSheet
      isOpen={isOpen}
      onClose={onClose}
      title="Layout"
      description={`${nodeCount} ${nodeCount === 1 ? 'node' : 'nodes'} on the canvas.`}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              resetOptions();
            }}
            disabled={isRunning}
          >
            <RotateCcw className="size-4" />
            Defaults
          </Button>
          <Button variant="primary" onClick={applyAndClose} isLoading={isRunning}>
            {!isRunning && <Sparkles className="size-4" />}
            Apply
          </Button>
        </>
      }
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium text-canvas-text">Direction</legend>
        {DIRECTION_OPTIONS.map((option) => {
          const isSelected = isCurrentDirection(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                applyLayout({ direction: option.value });
              }}
              aria-pressed={isSelected}
              className={cn(
                'flex min-h-touch-target w-full flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-colors',
                isSelected
                  ? 'border-accent bg-accent-soft'
                  : 'border-node-border hover:bg-node-surface-hover',
              )}
            >
              <span className="text-sm font-medium text-canvas-text">{option.label}</span>
              <span className="text-xs text-canvas-muted">{option.description}</span>
            </button>
          );
        })}
        <p className="mt-1 text-xs text-canvas-muted/80">
          Direction redraws the map straight away. The gaps below wait for Apply.
        </p>
      </fieldset>

      <div className="mt-5 flex flex-col gap-5">
        <RangeField
          id="horizontal-spacing"
          label="Generation gap"
          value={options.horizontalSpacing}
          min={HORIZONTAL_MIN}
          max={HORIZONTAL_MAX}
          step={HORIZONTAL_STEP}
          suffix="px"
          onChange={(horizontalSpacing) => {
            setSpacing({ horizontalSpacing });
          }}
        />
        <RangeField
          id="vertical-spacing"
          label="Sibling gap"
          value={options.verticalSpacing}
          min={VERTICAL_MIN}
          max={VERTICAL_MAX}
          step={VERTICAL_STEP}
          suffix="px"
          onChange={(verticalSpacing) => {
            setSpacing({ verticalSpacing });
          }}
        />
      </div>

      <p className="mt-5 text-xs text-canvas-muted">
        Defaults are {DEFAULT_LAYOUT_OPTIONS.horizontalSpacing}px between generations and{' '}
        {DEFAULT_LAYOUT_OPTIONS.verticalSpacing}px between siblings.
      </p>
    </ActionSheet>
  );
}

interface RangeFieldProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}

function RangeField({
  id,
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: RangeFieldProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-canvas-text">
          {label}
        </label>
        <span className="text-sm tabular-nums text-canvas-muted">
          {value}
          {suffix}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          onChange(Number(event.target.value));
        }}
        className={cn(
          'h-touch-target w-full cursor-pointer appearance-none bg-transparent',
          // The track and thumb are styled here because the range input is a
          // single element with no wrapper to hang classes on.
          '[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-node-border',
          '[&::-webkit-slider-thumb]:mt-[-7px] [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent',
          '[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-node-border',
          '[&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-accent',
        )}
      />
    </div>
  );
}
