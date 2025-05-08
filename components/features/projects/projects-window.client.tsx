"use client";

/**
 * @file Projects Window Client Component
 * @module components/features/projects/projects-window.client
 *
 * @description
 * Client-side window management functionality for the projects page.
 * This component handles window state (normal, minimized, maximized, closed)
 * and renders server-rendered content within a window-like UI.
 *
 * @clientComponent - This component uses client-side APIs and must be rendered on the client.
 */

import { useEffect, Suspense } from 'react';
import { WindowControls } from '@/components/ui/navigation/window-controls';
import { useRegisteredWindowState } from "@/lib/context/global-window-registry-context.client";
import { FolderKanban } from 'lucide-react';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';
import type { ClientBoundaryProps } from '@/types/component-types';
import { ProjectsListClient } from './projects-list.client';

// Define a unique ID for this window instance
const PROJECTS_WINDOW_ID = 'projects-window';

/**
 * Props for the ProjectsWindow component
 */
interface ProjectsWindowProps extends ClientBoundaryProps {
  /**
   * Server-rendered content to be displayed within the window
   */
  children: React.ReactNode;
}

/**
 * Dynamic import of the window content component to prevent server-side rendering
 * This ensures any layout effects or DOM manipulations only run on the client
 */
const ProjectsWindowContent = dynamic(
  () => Promise.resolve(({ children, windowState, onClose, onMinimize, onMaximize }: {
    children: React.ReactNode;
    windowState: string;
    onClose: () => void;
    onMinimize: () => void;
    onMaximize: () => void;
  }) => {
    const isMaximized = windowState === 'maximized';

    return (
      <div
        className={cn(
          "bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden",
          "transition-all duration-300 ease-in-out",
          // Maximize: Use fixed positioning, take full screen except header/footer space
          isMaximized
            ? 'fixed inset-0 top-16 bottom-16 md:bottom-4 max-w-none m-0 z-40'
            // Normal: Default flow, maybe some margin
            : 'relative max-w-5xl mx-auto mt-8'
        )}
      >
        <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4 sticky top-0 z-10">
          <div className="flex items-center">
            <WindowControls
              onClose={onClose}
              onMinimize={onMinimize}
              onMaximize={onMaximize}
            />
            <h1 className="text-xl font-mono ml-4">~/project-sandbox</h1>
          </div>
        </div>

        <div className={cn("h-full", isMaximized ? "overflow-y-auto" : "")}>
          <Suspense fallback={
            <div className="animate-pulse space-y-4 p-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={`skeleton-${i}`} className="bg-gray-200 dark:bg-gray-700 h-32 rounded-lg" />
              ))}
            </div>
          }>
            {children}
            <ProjectsListClient />
          </Suspense>
        </div>
      </div>
    );
  }),
  { ssr: false }
);

/**
 * ProjectsWindow Client Component
 *
 * Renders server-side generated content within a window-like UI that
 * supports minimizing, maximizing, and closing.
 *
 * @param {ProjectsWindowProps} props - Component props
 * @returns {JSX.Element | null} The rendered window or null if minimized/closed
 */
export function ProjectsWindow({ children }: ProjectsWindowProps) {
  const {
    windowState,
    close: closeWindow,
    minimize: minimizeWindow,
    maximize: maximizeWindow,
    isRegistered
  } = useRegisteredWindowState(PROJECTS_WINDOW_ID, FolderKanban, 'Restore Projects', 'normal');

  // Log state changes (optional)
  useEffect(() => {
    if (isRegistered) {
      console.log(`ProjectsWindow Render (${PROJECTS_WINDOW_ID}) - Window State:`, windowState);
    }
  }, [windowState, isRegistered]);

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
    <ProjectsWindowContent
      windowState={windowState}
      onClose={closeWindow}
      onMinimize={minimizeWindow}
      onMaximize={maximizeWindow}
    >
      {children}
    </ProjectsWindowContent>
  );
}