/**
 * Thoughts Window Client Component
 * @module components/features/thoughts/thoughts-window.client
 * @description
 * Client-side window management for the Thoughts feature.
 * Follows the established macOS window metaphor pattern.
 *
 * @clientComponent - Uses client-side APIs for window state management.
 */

"use client";

import React from "react";
import { WindowControls } from "@/components/ui/navigation/window-controls";
import { TerminalSearchHint } from "@/components/ui/terminal/terminal-search-hint";
import { useRegisteredWindowState } from "@/lib/context/global-window-registry-context.client";
import { cn } from "@/lib/utils";
import { Lightbulb, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ThoughtsWindowProps, ThoughtsWindowContentProps } from "@/types/features/thoughts";
import type { RegisteredWindowState } from "@/types/ui/window";

/**
 * Blinking cursor component for terminal-style aesthetic
 */
function BlinkingCursor(): React.JSX.Element {
  return (
    <span
      className={cn(
        "inline-block ml-0.5 w-[2px] h-[1em] align-middle",
        "bg-amber-500/70 dark:bg-amber-400/60",
        "animate-blink",
      )}
      aria-hidden="true"
    />
  );
}

const DEFAULT_THOUGHTS_WINDOW_ID = "thoughts-window";
/**
 * Inner content component for the window
 */
function ThoughtsWindowContentInner({
  children,
  windowState,
  onClose,
  onMinimize,
  onMaximize,
  windowTitle,
}: ThoughtsWindowContentProps): React.JSX.Element {
  const isMaximized = windowState === "maximized";

  const displayTitle = windowTitle || "~/thoughts";

  return (
    <div
      className={cn(
        "bg-white dark:bg-zinc-900 rounded-lg shadow-lg",
        "border border-zinc-200 dark:border-zinc-800 overflow-hidden",
        "transition-all duration-300 ease-in-out",
        isMaximized
          ? "fixed inset-0 top-16 bottom-16 md:bottom-4 max-w-none m-0 z-40 flex flex-col"
          : "relative max-w-4xl mx-auto mt-8",
      )}
    >
      {/* Window Header - Sticky */}
      <div
        className={cn(
          "border-b border-zinc-200 dark:border-zinc-800",
          "bg-zinc-50 dark:bg-zinc-800/50",
          "p-4 flex-shrink-0 sticky top-0 z-10",
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <WindowControls onClose={onClose} onMinimize={onMinimize} onMaximize={onMaximize} />
            <h1 className="text-xl font-mono ml-4 text-zinc-800 dark:text-zinc-200">
              <Link
                href="/thoughts"
                className="hover:underline decoration-zinc-400 underline-offset-4"
              >
                {displayTitle}
              </Link>
              <BlinkingCursor />
            </h1>
          </div>
          <TerminalSearchHint context="thoughts" />
        </div>
      </div>

      {/* Scrollable Content Area. Children arrive as resolved server markup
          from the page; a Suspense wrapper here would create a PPR
          postponement point that drops the list from prerendered HTML. */}
      <div className={cn("h-full", isMaximized ? "overflow-y-auto flex-grow" : "")}>{children}</div>
    </div>
  );
}

/**
 * ThoughtsWindow Client Component
 *
 * Wraps content in a macOS-style window with minimize/maximize/close controls.
 * Uses the global window registry for state management.
 */
export function ThoughtsWindow({
  children,
  windowTitle,
  windowId,
}: ThoughtsWindowProps): React.JSX.Element | null {
  const uniqueId = windowId || DEFAULT_THOUGHTS_WINDOW_ID;
  const restoreTitle = "Restore Thoughts";

  const {
    windowState,
    close: closeWindow,
    minimize: minimizeWindow,
    maximize: maximizeWindow,
  }: RegisteredWindowState = useRegisteredWindowState(
    uniqueId,
    Lightbulb as LucideIcon,
    restoreTitle,
    "normal",
  );

  // windowState falls back to "normal" until client-side registration, so
  // content renders during SSR and the first client paint matches (no shift).
  // Closed or minimized windows are hidden
  if (windowState === "closed" || windowState === "minimized") {
    return null;
  }

  return (
    <ThoughtsWindowContentInner
      windowState={windowState}
      onClose={closeWindow}
      onMinimize={minimizeWindow}
      onMaximize={maximizeWindow}
      windowTitle={windowTitle}
    >
      {children}
    </ThoughtsWindowContentInner>
  );
}
