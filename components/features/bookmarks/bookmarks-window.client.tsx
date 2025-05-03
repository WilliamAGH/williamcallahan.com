"use client";

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

import { useEffect, Suspense } from 'react';
import { WindowControls } from '@/components/ui/navigation/window-controls';
import { useRegisteredWindowState } from "@/lib/context/global-window-registry-context.client";
import { Bookmark } from 'lucide-react';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';
import type { ClientBoundaryProps } from '@/types/component-types';

// Define a unique ID for this window instance
// Use this as the default window ID, but it can be overridden with props
const DEFAULT_BOOKMARKS_WINDOW_ID = 'bookmarks-window';

/**
 * Props for the BookmarksWindow component
 */
interface BookmarksWindowProps extends ClientBoundaryProps {
  /**
   * Content to be displayed within the window
   */
  children: React.ReactNode;
  
  /**
   * Optional slug to display in the title bar
   * Example: "~/tag-name/bookmarks" instead of just "~/bookmarks"
   */
  titleSlug?: string;
  
  /**
   * Optional window ID. If not provided, uses the default 'bookmarks-window'
   */
  windowId?: string;
}

/**
 * Dynamic import of the window content component to prevent server-side rendering
 * This ensures any layout effects or DOM manipulations only run on the client
 */
const BookmarksWindowContent = dynamic(
  () => Promise.resolve(({ children, windowState, onClose, onMinimize, onMaximize, titleSlug }: {
    children: React.ReactNode;
    windowState: string;
    onClose: () => void;
    onMinimize: () => void;
    onMaximize: () => void;
    titleSlug?: string;
  }) => {
    const isMaximized = windowState === 'maximized';
    
    // Format the title slug for display
    const formattedTitle = titleSlug 
      ? `~/${titleSlug}/bookmarks` 
      : '~/bookmarks';

    return (
      <div
        className={cn(
          "bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden",
          "transition-all duration-300 ease-in-out",
          // Maximize: Use fixed positioning, take full screen except header/footer space
          isMaximized
            ? 'fixed inset-0 top-16 bottom-16 md:bottom-4 max-w-none m-0 z-40'
            // Normal: Default flow with full width on larger screens
            : 'relative mx-auto mt-8 w-full max-w-[95%] xl:max-w-[1400px] 2xl:max-w-[1800px]'
        )}
      >
        <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4 sticky top-0 z-10">
          <div className="flex items-center">
            <WindowControls
              onClose={onClose}
              onMinimize={onMinimize}
              onMaximize={onMaximize}
            />
            <h1 className="text-xl font-mono ml-4">{formattedTitle}</h1>
          </div>
        </div>

        <div className={cn("h-full", isMaximized ? "overflow-y-auto" : "")}>
          <Suspense fallback={
            <div className="animate-pulse space-y-4 p-6">
              {[...Array(6)].map((_, i) => (
                <div key={`skeleton-${i}`} className="bg-gray-200 dark:bg-gray-700 h-32 rounded-lg" />
              ))}
            </div>
          }>
            {children}
          </Suspense>
        </div>
      </div>
    );
  }),
  { ssr: false }
);

/**
 * BookmarksWindow Client Component
 *
 * Renders content within a window-like UI that
 * supports minimizing, maximizing, and closing.
 *
 * @param {BookmarksWindowProps} props - Component props
 * @returns {JSX.Element | null} The rendered window or null if minimized/closed
 */
export function BookmarksWindow({ children, titleSlug, windowId }: BookmarksWindowProps) {
  // Generate a unique windowId if a slug is provided
  const uniqueId = windowId 
    || (titleSlug ? `bookmarks-${titleSlug}-window` : DEFAULT_BOOKMARKS_WINDOW_ID);
  
  // Add display title for restore button
  const restoreTitle = titleSlug 
    ? `Restore ${titleSlug} Bookmarks`
    : 'Restore Bookmarks';
    
  const {
    windowState,
    close: closeWindow,
    minimize: minimizeWindow,
    maximize: maximizeWindow,
    isRegistered
  } = useRegisteredWindowState(uniqueId, Bookmark, restoreTitle, 'normal');

  // Log state changes (optional)
  useEffect(() => {
    if (isRegistered) {
      console.log(`BookmarksWindow Render (${uniqueId}) - Window State:`, windowState);
    }
  }, [windowState, isRegistered, uniqueId]);

  // Render nothing until ready
  if (!isRegistered) {
    return null;
  }

  // Handle closed state
  if (windowState === "closed") {
    return null;
  }

  // Handle minimized state
  if (windowState === "minimized") {
    return null;
  }

  return (
    <BookmarksWindowContent
      windowState={windowState}
      onClose={closeWindow}
      onMinimize={minimizeWindow}
      onMaximize={maximizeWindow}
      titleSlug={titleSlug}
    >
      {children}
    </BookmarksWindowContent>
  );
}