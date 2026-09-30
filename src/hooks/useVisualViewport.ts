"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tracks the visual viewport so the UI can adapt to the virtual keyboard.
 *
 * `window.innerHeight` does not change when a soft keyboard opens on iOS or
 * Android; only `window.visualViewport.height` shrinks, and the page is often
 * scrolled by the browser to keep the focused field visible. Anything anchored
 * to the bottom of the screen therefore ends up underneath the keyboard unless
 * it is told how much room is left.
 */

export interface VisualViewportState {
  /** Height of the visual viewport in CSS pixels. */
  height: number;
  width: number;
  /** Distance between the visual viewport and the layout viewport. */
  offsetTop: number;
  /** Distance between the visual viewport and the layout viewport. */
  offsetLeft: number;
  /** Height of the layout viewport, i.e. `window.innerHeight`. */
  windowHeight: number;
  /** True once a soft keyboard is judged to be covering part of the screen. */
  isKeyboardOpen: boolean;
  /** True below the Tailwind `sm` breakpoint. */
  isMobile: boolean;
  /** True on a coarse pointer, i.e. a touch-first device. */
  isTouch: boolean;
}

/**
 * How much the visual viewport must shrink before the keyboard counts as open.
 *
 * A 100px drop filters out browser chrome collapsing on scroll and the small
 * jitter of the URL bar, which both fire resize events without a keyboard.
 */
export const KEYBOARD_DETECTION_THRESHOLD_PX = 100;

/** Matches the Tailwind `sm` breakpoint used throughout the design system. */
export const MOBILE_BREAKPOINT_PX = 768;

function readViewportState(): VisualViewportState {
  const visual = typeof window === 'undefined' ? null : window.visualViewport;
  const windowHeight = typeof window === 'undefined' ? 0 : window.innerHeight;

  // `visualViewport` is missing in older Safari and in any non-browser render,
  // in which case the layout viewport is the best available answer.
  const height = visual?.height ?? windowHeight;
  const width = visual?.width ?? (typeof window === 'undefined' ? 0 : window.innerWidth);

  return {
    height,
    width,
    offsetTop: visual?.offsetTop ?? 0,
    offsetLeft: visual?.offsetLeft ?? 0,
    windowHeight,
    isKeyboardOpen: windowHeight - height > KEYBOARD_DETECTION_THRESHOLD_PX,
    isMobile: width < MOBILE_BREAKPOINT_PX,
    isTouch:
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(pointer: coarse)').matches ?? false),
  };
}

export interface UseVisualViewportResult extends VisualViewportState {
  /** Re-reads the viewport on demand, e.g. after a programmatic scroll. */
  refresh: () => void;
}

/**
 * @returns live visual viewport metrics, updated on resize and scroll.
 */
export function useVisualViewport(): UseVisualViewportResult {
  const [state, setState] = useState<VisualViewportState>(readViewportState);
  const frame = useRef<number | null>(null);

  const refresh = useCallback(() => {
    // Resize and scroll can fire many times per frame; one read per frame keeps
    // the handler cheap even while a keyboard animates open.
    if (frame.current !== null) {
      return;
    }
    frame.current = window.requestAnimationFrame(() => {
      frame.current = null;
      setState(readViewportState());
    });
  }, []);

  useEffect(() => {
    const visual = window.visualViewport;
    refresh();

    if (visual) {
      visual.addEventListener('resize', refresh);
      visual.addEventListener('scroll', refresh);
    }
    // Safari resizes the layout viewport itself when the keyboard opens, so the
    // window listener is the only one that fires on some engines.
    window.addEventListener('resize', refresh);
    window.addEventListener('orientationchange', refresh);

    return () => {
      if (visual) {
        visual.removeEventListener('resize', refresh);
        visual.removeEventListener('scroll', refresh);
      }
      window.removeEventListener('resize', refresh);
      window.removeEventListener('orientationchange', refresh);
      if (frame.current !== null) {
        window.cancelAnimationFrame(frame.current);
        frame.current = null;
      }
    };
  }, [refresh]);

  return { ...state, refresh };
}
