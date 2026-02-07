/**
 * @file Bookmarks Window Client Component
 * @module components/features/bookmarks/bookmarks-window.client
 *
 * @description
 * Client-side window management functionality for the bookmarks page.
 * This component handles window state (normal, minimized, maximized, closed)
 * and renders server-rendered content within a window-like UI.
 *
 * @clientComponent - This component uses client-side APIs and must be rendered on the client.
 */

"use client";

import React, { Suspense, useEffect, type JSX } from "react";
import { WindowControls } from "@/components/ui/navigation/window-controls";
import { TerminalSearchHint } from "@/components/ui/terminal/terminal-search-hint";
import { useRegisteredWindowState } from "@/lib/context/global-window-registry-context.client";
import { cn } from "@/lib/utils";
import { Bookmark, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type {
  RegisteredWindowState,
  BookmarksWindowContentProps,
  BookmarksWindowClientPropsExtended as BookmarksWindowClientProps,
} from "@/types";

// Define a unique ID for this window instance
// Use this as the default window ID, but it can be overridden with props
const DEFAULT_BOOKMARKS_WINDOW_ID = "bookmarks-window";

/**
 * Skeleton loader component with stable keys for loading states
 * @returns {JSX.Element} Skeleton loading animation
 */
const BOOKMARK_SKELETON_KEYS = [
  "bookmark-skeleton-1",
  "bookmark-skeleton-2",
  "bookmark-skeleton-3",
  "bookmark-skeleton-4",
  "bookmark-skeleton-5",
  "bookmark-skeleton-6",
];

const SkeletonLoader = (): JSX.Element => (
  <div className="animate-pulse space-y-4 p-6">
    {BOOKMARK_SKELETON_KEYS.map((key) => (
      <div key={key} className="bg-gray-200 dark:bg-gray-700 h-32 rounded-lg" />
    ))}
  </div>
);

/**
 * Inner content component that renders the window chrome (title bar, controls)
 * and wraps children in a Suspense boundary.
 *
 * Rendered directly (no dynamic import / ssr:false) so that the full content
 * tree — including images — is present in the initial server HTML, letting
 * browsers start loading images before client JS hydrates.
 */
function BookmarksWindowContentInner({
  children,
  windowState,
  onClose,
  onMinimize,
  onMaximize,
  titleSlug,
  windowTitle,
}: BookmarksWindowContentProps): React.JSX.Element {
  const isMaximized = windowState === "maximized";

  // Format the title slug for display
  const formattedTitle = windowTitle
    ? windowTitle
    : titleSlug
      ? `~/${titleSlug}/bookmarks`
      : "~/bookmarks";

  return (
    <div
      className={cn(
        "bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden",
        "transition-all duration-300 ease-in-out",
        // Maximize: Use fixed positioning, take full screen except header/footer space
        isMaximized
          ? "fixed inset-0 top-16 bottom-16 md:bottom-4 max-w-none m-0 z-40"
          : // Normal: Default flow matching site-wide container width
            "relative max-w-5xl mx-auto mt-8",
      )}
    >
      <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <WindowControls onClose={onClose} onMinimize={onMinimize} onMaximize={onMaximize} />
            <h1 className="text-xl font-mono ml-4">
              <Link href="/bookmarks" className="hover:underline">
                {formattedTitle}
              </Link>
            </h1>
          </div>
          <TerminalSearchHint context="bookmarks" />
        </div>
      </div>

      <div className={cn("h-full", isMaximized ? "overflow-y-auto" : "")}>
        <Suspense fallback={<SkeletonLoader />}>{children}</Suspense>
      </div>
    </div>
  );
}

/**
 * BookmarksWindow Client Component
 *
 * Renders content within a window-like UI that supports minimizing, maximizing, and closing.
 * Uses the global window registry to manage state across the application.
 *
 * The content tree is SSR'd so that images and text appear in the initial HTML.
 * `windowState` falls back to `initialState` ("normal") before the registry
 * effect fires, so the first render always shows the full window — no
 * null → content flash.
 *
 * @param {BookmarksWindowClientProps} props - Component props
 * @returns {JSX.Element | null} The rendered window or null if minimized/closed
 */
export function BookmarksWindow({
  children,
  titleSlug,
  windowTitle,
  windowId,
}: BookmarksWindowClientProps) {
  // Generate a unique windowId if a slug is provided
  const uniqueId =
    windowId || (titleSlug ? `bookmarks-${titleSlug}-window` : DEFAULT_BOOKMARKS_WINDOW_ID);

  // Add display title for restore button
  const restoreTitle = titleSlug ? `Restore ${titleSlug} Bookmarks` : "Restore Bookmarks";

  const {
    windowState,
    close: closeWindow,
    minimize: minimizeWindow,
    maximize: maximizeWindow,
    isRegistered,
  }: RegisteredWindowState = useRegisteredWindowState(
    uniqueId,
    Bookmark as LucideIcon,
    restoreTitle,
    "normal",
  );

  // Log state changes for debugging purposes
  useEffect(() => {
    if (isRegistered) {
      console.log(`BookmarksWindow Render (${uniqueId}) - Window State:`, windowState);
    }
  }, [windowState, isRegistered, uniqueId]);

  // Handle closed state
  if (windowState === "closed") {
    return null;
  }

  // Handle minimized state
  if (windowState === "minimized") {
    return null;
  }

  return (
    <BookmarksWindowContentInner
      windowState={windowState}
      onClose={closeWindow}
      onMinimize={minimizeWindow}
      onMaximize={maximizeWindow}
      titleSlug={titleSlug}
      windowTitle={windowTitle}
    >
      {children}
    </BookmarksWindowContentInner>
  );
}
