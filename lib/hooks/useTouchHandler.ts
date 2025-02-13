// lib/hooks/useTouchHandler.ts

/**
 * Touch Handler Hook
 *
 * Custom hook for handling touch events with proper cleanup and state management.
 * Implements proper race condition prevention and cleanup following Next.js 14 patterns.
 * Includes iOS Safari support and passive event optimization.
 */

import { useCallback, useRef, useEffect } from "react";
import { debounce } from "@/lib/utils";

interface TouchState {
  startX: number;
  startY: number;
  lastX: number;
  isScrolling: boolean;
  scrollTimeout?: number;
}

interface TouchHandlerOptions {
  onSwipeLeft?: () => void;
  threshold?: number;
  enabled?: boolean;
  preventScroll?: boolean;
}

const SCROLL_TIMEOUT = 300; // Time in ms to determine if user is scrolling
const PASSIVE_EVENTS = { passive: true };
const NON_PASSIVE_EVENTS = { passive: false };

export function useTouchHandler({
  onSwipeLeft,
  threshold = -70,
  enabled = true,
  preventScroll = false
}: TouchHandlerOptions = {}) {
  const touchRef = useRef<TouchState | null>(null);
  const isEnabledRef = useRef(enabled);

  // Update enabled state
  useEffect(() => {
    isEnabledRef.current = enabled;
  }, [enabled]);

  // Clean up on unmount or when disabled
  useEffect(() => {
    return () => {
      if (touchRef.current?.scrollTimeout) {
        window.clearTimeout(touchRef.current.scrollTimeout);
      }
      touchRef.current = null;
    };
  }, []);

  // Debounced touch move handler for better performance
  const debouncedTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!touchRef.current || !isEnabledRef.current) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - touchRef.current.startX;
      const deltaY = touch.clientY - touchRef.current.startY;

      // Only prevent scroll if horizontal swipe and prevention is enabled
      if (preventScroll && Math.abs(deltaX) > Math.abs(deltaY) && !touchRef.current.isScrolling) {
        e.preventDefault();
      }

      touchRef.current.lastX = touch.clientX;
    },
    [preventScroll]
  );

  const handleTouchMove = useCallback((e: TouchEvent) => {
    const debouncedFn = debounce((evt: TouchEvent) => {
      debouncedTouchMove(evt);
    }, 16); // ~60fps
    debouncedFn(e);
  }, [debouncedTouchMove]);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!isEnabledRef.current) return;

    const touch = e.touches[0];
    if (touchRef.current?.scrollTimeout) {
      window.clearTimeout(touchRef.current.scrollTimeout);
    }

    touchRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      lastX: touch.clientX,
      isScrolling: false,
      scrollTimeout: window.setTimeout(() => {
        if (touchRef.current) {
          touchRef.current.isScrolling = true;
        }
      }, SCROLL_TIMEOUT)
    };
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!touchRef.current || !isEnabledRef.current) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchRef.current.startX;

    // Only trigger swipe if not scrolling
    if (!touchRef.current.isScrolling && deltaX < threshold && onSwipeLeft) {
      onSwipeLeft();
    }

    if (touchRef.current.scrollTimeout) {
      window.clearTimeout(touchRef.current.scrollTimeout);
    }
    touchRef.current = null;
  }, [threshold, onSwipeLeft]);

  const handleTouchCancel = useCallback(() => {
    if (touchRef.current?.scrollTimeout) {
      window.clearTimeout(touchRef.current.scrollTimeout);
    }
    touchRef.current = null;
  }, []);

  return {
    touchHandlers: enabled ? {
      onTouchStart: (e: React.TouchEvent) => handleTouchStart(e.nativeEvent),
      onTouchMove: (e: React.TouchEvent) => handleTouchMove(e.nativeEvent),
      onTouchEnd: (e: React.TouchEvent) => handleTouchEnd(e.nativeEvent),
      onTouchCancel: () => handleTouchCancel()
    } : {},
    eventOptions: {
      touchStart: PASSIVE_EVENTS,
      touchMove: preventScroll ? NON_PASSIVE_EVENTS : PASSIVE_EVENTS,
      touchEnd: PASSIVE_EVENTS,
      touchCancel: PASSIVE_EVENTS
    }
  };
}
