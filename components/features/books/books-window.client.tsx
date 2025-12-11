/**
 * Books Window Client Component
 * @module components/features/books/books-window.client
 * @description
 * Client-side window management for the books page.
 * Provides macOS-style window chrome with minimize/maximize/close controls.
 */

"use client";

import React, { Suspense, useMemo, type JSX } from "react";
import { WindowControls } from "@/components/ui/navigation/window-controls";
import { useRegisteredWindowState } from "@/lib/context/global-window-registry-context.client";
import { cn } from "@/lib/utils";
import { BookOpen, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { RegisteredWindowState } from "@/types";
import type { BooksWindowProps, BooksWindowContentProps } from "@/types/features/books";

const DEFAULT_BOOKS_WINDOW_ID = "books-window";

const SkeletonLoader = (): JSX.Element => {
  const skeletonKeys = useMemo(() => Array.from({ length: 6 }, () => crypto.randomUUID()), []);

  return (
    <div className="animate-pulse space-y-4 p-6">
      {skeletonKeys.map(key => (
        <div key={key} className="bg-gray-200 dark:bg-gray-700 h-32 rounded-lg" />
      ))}
    </div>
  );
};

function BooksWindowContentInner({
  children,
  windowState,
  onClose,
  onMinimize,
  onMaximize,
  windowTitle,
}: BooksWindowContentProps): React.JSX.Element {
  const isMaximized = windowState === "maximized";
  const formattedTitle = windowTitle ?? "~/books";

  return (
    <div
      className={cn(
        "bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden",
        "transition-all duration-300 ease-in-out",
        isMaximized
          ? "fixed inset-0 top-16 bottom-16 md:bottom-4 max-w-none m-0 z-40"
          : "relative max-w-5xl mx-auto mt-8",
      )}
    >
      <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4 sticky top-0 z-10">
        <div className="flex items-center">
          <WindowControls onClose={onClose} onMinimize={onMinimize} onMaximize={onMaximize} />
          <h1 className="text-xl font-mono ml-4">
            <Link href="/books" className="hover:underline">
              {formattedTitle}
            </Link>
          </h1>
        </div>
      </div>

      <div className={cn("h-full", isMaximized ? "overflow-y-auto" : "")}>
        <Suspense fallback={<SkeletonLoader />}>{children}</Suspense>
      </div>
    </div>
  );
}

export function BooksWindow({ children, windowTitle, windowId }: BooksWindowProps) {
  const uniqueId = windowId ?? DEFAULT_BOOKS_WINDOW_ID;
  const restoreTitle = "Restore Books";

  const {
    windowState,
    close: closeWindow,
    minimize: minimizeWindow,
    maximize: maximizeWindow,
    isRegistered,
  }: RegisteredWindowState = useRegisteredWindowState(uniqueId, BookOpen as LucideIcon, restoreTitle, "normal");

  // Return skeleton while waiting for registration - prevents layout shift
  if (!isRegistered) {
    return (
      <div className="relative max-w-5xl mx-auto mt-8 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
        <SkeletonLoader />
      </div>
    );
  }

  // Closed or minimized windows are hidden
  if (windowState === "closed" || windowState === "minimized") {
    return null;
  }

  return (
    <BooksWindowContentInner
      windowState={windowState}
      onClose={closeWindow}
      onMinimize={minimizeWindow}
      onMaximize={maximizeWindow}
      windowTitle={windowTitle}
    >
      {children}
    </BooksWindowContentInner>
  );
}
