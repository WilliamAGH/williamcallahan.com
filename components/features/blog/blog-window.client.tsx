"use client";

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

import { useEffect, Suspense } from 'react';
import { WindowControls } from '@/components/ui/navigation/window-controls';
import { useRegisteredWindowState } from "@/lib/context/global-window-registry-context.client";
import { Newspaper } from 'lucide-react';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';
import type { ClientBoundaryProps } from '@/types/component-types';

// Define a unique ID for this window instance
const BLOG_WINDOW_ID = 'blog-window';

/**
 * Props for the BlogWindow component
 */
interface BlogWindowProps extends ClientBoundaryProps {
  /**
   * Server-rendered content to be displayed within the window
   */
  children: React.ReactNode;
}

/**
 * Dynamic import of the window content component to prevent server-side rendering
 * This ensures any layout effects or DOM manipulations only run on the client
 */
const BlogWindowContent = dynamic(
  () => Promise.resolve(({ children, windowState, onClose, onMinimize, onMaximize }: {
    children: React.ReactNode;
    windowState: string;
    onClose: () => void;
    onMinimize: () => void;
    onMaximize: () => void;
  }) => {
    const isMaximized = windowState === 'maximized';

    return (
      <div className={cn(
        // Base styles
        "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 overflow-hidden",
        "transition-all duration-300 ease-in-out",
        // Normal state styles
        "relative max-w-5xl mx-auto mt-8 rounded-lg shadow-lg",
        // Maximized state overrides
        isMaximized &&
          "fixed inset-0 z-[60] max-w-none m-0 rounded-none shadow-none flex flex-col h-full top-16 bottom-16 md:bottom-4"
      )}>
        {/* Sticky Header */}
        <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4 flex-shrink-0 sticky top-0 z-10">
          <div className="flex items-center">
            <WindowControls
              onClose={onClose}
              onMinimize={onMinimize}
              onMaximize={onMaximize}
            />
            <h1 className="text-xl font-mono ml-4">~/blog</h1>
          </div>
        </div>

        {/* Scrollable Content Area */}
        <div className={cn(
          "p-6",
          isMaximized ? "overflow-y-auto flex-grow" : ""
        )}>
          {/* Use simple children instead of Suspense to avoid promise errors */}
          {children}
        </div>
      </div>
    );
  }),
  { ssr: false, loading: () => (
    <div className="animate-pulse space-y-4 p-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg max-w-5xl mx-auto mt-8">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="bg-gray-200 dark:bg-gray-700 h-32 rounded-lg" />
      ))}
    </div>
  )}
);

/**
 * BlogWindow Client Component
 *
 * Renders server-side generated content within a window-like UI that
 * supports minimizing, maximizing, and closing.
 *
 * @param {BlogWindowProps} props - Component props
 * @returns {JSX.Element | null} The rendered window or null if minimized/closed
 */
export function BlogWindow({ children }: BlogWindowProps) {
  // Register this window instance and get its state/actions
  const {
    windowState,
    close: closeWindow,
    minimize: minimizeWindow,
    maximize: maximizeWindow,
    isRegistered
  } = useRegisteredWindowState(BLOG_WINDOW_ID, Newspaper, 'Restore Blog', 'normal');

  // Log state changes (optional)
  useEffect(() => {
    if (isRegistered) {
      console.log(`Blog Component Render (${BLOG_WINDOW_ID}) - Window State:`, windowState);
    }
  }, [windowState, isRegistered]);

  // Render nothing until ready to prevent hydration mismatch
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
    <BlogWindowContent
      windowState={windowState}
      onClose={closeWindow}
      onMinimize={minimizeWindow}
      onMaximize={maximizeWindow}
    >
      {children}
    </BlogWindowContent>
  );
}