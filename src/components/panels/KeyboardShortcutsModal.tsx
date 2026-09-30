"use client";

import { useEffect, useMemo, useState } from "react";
import { Keyboard } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import {
  KEYBOARD_SHORTCUTS,
  formatShortcut,
  type KeyboardShortcut,
} from "@/hooks/useKeyboardNavigation";
import { cn } from "@/lib/cn";

/**
 * The shortcut sheet.
 *
 * It renders `KEYBOARD_SHORTCUTS`, the same list the key handler dispatches on,
 * so a binding that changes in one place cannot go stale in the other. The only
 * thing the dialog adds is the glyph: an Apple keyboard has no key labelled
 * "Mod", so the modifier is named for the hardware in front of the user.
 *
 * A phone has no modifier keys at all, which is why the closing note points at
 * the toolbar rather than pretending the list applies.
 */

const GROUP_ORDER = ['Edit', 'Node', 'View', 'Panels'] as const;

/** Apple renders its modifiers as glyphs, which is what a Mac user looks for. */
const APPLE_GLYPHS: ReadonlyArray<[string, string]> = [
  ['Mod', '⌘'],
  ['Shift', '⇧'],
  ['Alt', '⌥'],
];

function useIsAppleHardware(): boolean {
  const [isApple, setIsApple] = useState(false);

  useEffect(() => {
    // `platform` is deprecated but still the only synchronous answer, and this is
    // a label, not a capability check.
    const platform =
      (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
      navigator.platform;
    setIsApple(/mac|iphone|ipad|ipod/i.test(platform));
  }, []);

  return isApple;
}

export interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsModal({
  isOpen,
  onClose,
}: KeyboardShortcutsModalProps): React.JSX.Element {
  const isApple = useIsAppleHardware();

  const groups = useMemo(() => {
    const byGroup = new Map<string, KeyboardShortcut[]>();
    for (const shortcut of KEYBOARD_SHORTCUTS) {
      const bucket = byGroup.get(shortcut.group);
      if (bucket) {
        bucket.push(shortcut);
      } else {
        byGroup.set(shortcut.group, [shortcut]);
      }
    }
    return GROUP_ORDER.map((group) => ({ group, shortcuts: byGroup.get(group) ?? [] })).filter(
      (entry) => entry.shortcuts.length > 0,
    );
  }, []);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Keyboard shortcuts"
      description={`${KEYBOARD_SHORTCUTS.length} shortcuts. Nothing fires while you are typing.`}
      size="md"
      footer={
        <Button variant="primary" onClick={onClose}>
          Got it
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        {groups.map(({ group, shortcuts }) => (
          <section key={group} className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-canvas-muted uppercase">
              <span aria-hidden="true">
                <Keyboard className="size-3.5" />
              </span>
              {group}
            </h3>
            <dl className="flex flex-col">
              {shortcuts.map((shortcut) => (
                <div
                  key={shortcut.id}
                  className="flex items-center justify-between gap-4 border-b border-node-border/60 py-2 last:border-b-0"
                >
                  <dt className="min-w-0 flex-1 text-sm text-canvas-text">
                    {shortcut.description}
                  </dt>
                  <dd className="shrink-0">
                    <kbd
                      className={cn(
                        'rounded-md border border-node-border bg-node-surface px-2 py-1',
                        'font-mono text-xs text-canvas-muted',
                      )}
                    >
                      {describeCombo(shortcut.combo, isApple)}
                    </kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}

        <p className="rounded-xl border border-dashed border-node-border p-3 text-xs text-canvas-muted">
          On a phone there is no modifier key, so the same commands live in the toolbar and its
          More sheet.
        </p>
      </div>
    </Modal>
  );
}

/** Formats a combo, naming the modifiers after the hardware in use. */
function describeCombo(combo: string, isApple: boolean): string {
  const formatted = formatShortcut(combo);
  if (!isApple) {
    return formatted;
  }
  let result = formatted;
  for (const [name, glyph] of APPLE_GLYPHS) {
    result = result.replaceAll(name, glyph);
  }
  return result;
}
