/**
 * @file Blog Window Client Component
 * @module components/features/blog/blog-window.client
 *
 * @description
 * Client-side window management functionality for the blog page.
 * This component handles window state (normal, minimized, maximized, closed)
 * and renders server-rendered content within a window-like UI.
 *
 * @clientComponent - This component uses client-side APIs and must be rendered on the client.
 */

"use client";

import React, { useRef } from "react";
import { WindowControls } from "@/components/ui/navigation/window-controls";
import { TerminalSearchHint } from "@/components/ui/terminal/terminal-search-hint";
import { useFixSvgTransforms } from "@/lib/hooks/use-fix-svg-transforms";
import { useRegisteredWindowState } from "@/lib/context/global-window-registry-context.client";
import { cn } from "@/lib/utils";
import type { BlogWindowClientProps } from "@/types/features/blog";
import { Newspaper } from "lucide-react";

// Define a unique ID for this window instance
const BLOG_WINDOW_ID = "blog-window";

// Using centralized BlogWindowClientProps from @/types/features

function BlogWindowContent({
  children,
  windowState,
  onClose,
  onMinimize,
  onMaximize,
  contentRef,
  windowTitle,
}: {
  children: React.ReactNode;
  windowState: string;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
  contentRef: React.RefObject<HTMLDivElement | null>;
  windowTitle?: string;
}): React.JSX.Element {
  const isMaximized = windowState === "maximized";

  // Fix SVG transforms within this window
  useFixSvgTransforms({ rootRef: contentRef });

  return (
    <div
      ref={contentRef}
      className={cn(
        "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 overflow-hidden",
        "transition-all duration-300 ease-in-out",
        "relative max-w-5xl mx-auto mt-8 rounded-lg shadow-lg",
        isMaximized &&
          "fixed inset-0 z-[60] max-w-none m-0 rounded-none shadow-none flex flex-col h-full top-16 bottom-16 md:bottom-4",
      )}
    >
      {/* Sticky Header */}
      <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4 flex-shrink-0 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <WindowControls onClose={onClose} onMinimize={onMinimize} onMaximize={onMaximize} />
            <h1 className="text-xl font-mono ml-4">{windowTitle || "~/blog"}</h1>
          </div>
          <TerminalSearchHint context="blog" />
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div className={cn("p-6", isMaximized ? "overflow-y-auto flex-grow" : "")}>{children}</div>
    </div>
  );
}

/**
 * BlogWindow Client Component
 *
 * Renders server-side generated content within a window-like UI that
 * supports minimizing, maximizing, and closing. Content renders during SSR so
 * posts and their links are present in the initial HTML for crawlers; the
 * window registry falls back to "normal" state until client registration.
 *
 * @param {BlogWindowClientProps} props - Component props
 * @returns {JSX.Element | null} The rendered window or null if minimized/closed
 */
export function BlogWindow({
  children,
  windowTitle,
}: BlogWindowClientProps & { windowTitle?: string }) {
  // Ref for the content container
  const contentRef = useRef<HTMLDivElement>(null);

  // Register this window instance and get its state/actions
  const {
    windowState,
    close: closeWindow,
    minimize: minimizeWindow,
    maximize: maximizeWindow,
  } = useRegisteredWindowState(BLOG_WINDOW_ID, Newspaper, "Restore Blog", "normal");

  // Handle closed or minimized state
  if (windowState === "closed" || windowState === "minimized") {
    return null;
  }

  // windowState falls back to "normal" until client-side registration, so the
  // server render and first client paint are identical (no hydration shift).
  return (
    <BlogWindowContent
      windowState={windowState}
      onClose={closeWindow}
      onMinimize={minimizeWindow}
      onMaximize={maximizeWindow}
      contentRef={contentRef}
      windowTitle={windowTitle}
    >
      {children}
    </BlogWindowContent>
  );
}
