/**
 * Projects Section Component - Client Wrapper
 *
 * Manages the window state (minimize, maximize, close) for the Projects section.
 * Renders the ProjectsContent server component within a window frame.
 */

"use client";

import { useEffect, Suspense } from 'react';
import Link from 'next/link';
import { projects } from '@/data/projects';
import { ProjectCardServer } from './project-card.server';
import { WindowControls } from '@/components/ui/navigation/window-controls';
import GitHubActivity from '@/components/features/github/github-activity';
import { useRegisteredWindowState } from "@/lib/context/GlobalWindowRegistryContext"; // Use the correct hook
import { FolderKanban } from 'lucide-react'; // Import an icon
import { cn } from '@/lib/utils';

// Define a unique ID for this window instance
const PROJECTS_WINDOW_ID = 'projects-window';

// --- Server Component for Content ---
// (Kept as an inner component for structure)
function ProjectsContent() {
  return (
    <div className="p-6">
      <div className="prose dark:prose-invert max-w-none mb-8">
        <p>
          Welcome to my a sandbox of my various experiments / projects / works-in-progress. Be sure to visit my{' '}
          <Link href="/experience" className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300">
            experience page
          </Link>{' '}
          if you&apos;d like a better look at some of my more &apos;complete&apos; work as well.
        </p>
      </div>
      <Suspense fallback={<div>Loading GitHub activity...</div>}>
        <GitHubActivity />
      </Suspense>
      <div className="space-y-6 mt-8">
        {projects.map((project) => (
          <ProjectCardServer key={project.name} project={project} />
        ))}
      </div>
    </div>
  );
}

// --- Client Component Wrapper ---
export function ProjectsClient() {
  // Use the registered window state hook
  const {
    windowState,
    close: closeWindow,
    minimize: minimizeWindow,
    maximize: maximizeWindow,
    isRegistered
  } = useRegisteredWindowState(PROJECTS_WINDOW_ID, FolderKanban, 'Restore Projects', 'normal');

  // Log state changes (optional, for debugging)
  useEffect(() => {
    if (isRegistered) {
      console.log(`ProjectsClient Render (${PROJECTS_WINDOW_ID}) - Window State:`, windowState);
    }
  }, [windowState, isRegistered]);

  // Render nothing until ready
  if (!isRegistered) {
    console.log(`ProjectsClient (${PROJECTS_WINDOW_ID}): Waiting for registration...`);
    return <></>; // Or a suitable skeleton/placeholder
  }

  // Handle closed state
  if (windowState === "closed") {
    console.log(`ProjectsClient (${PROJECTS_WINDOW_ID}): Rendering null (closed)`);
    return <></>;
  }

  // Handle minimized state (render nothing, handled by FloatingRestoreButtons)
  if (windowState === "minimized") {
    console.log(`ProjectsClient (${PROJECTS_WINDOW_ID}): Rendering null (minimized)`);
    return <></>;
  }

  // Render normal or maximized view
  console.log(`ProjectsClient (${PROJECTS_WINDOW_ID}): Rendering ${windowState} view`);
  const isMaximized = windowState === 'maximized';

  return (
    // Removed the outer container div, assuming the page provides it
    <div
      className={cn(
        "bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden",
        "transition-all duration-300 ease-in-out", // Add transitions
        // Maximize: Use fixed positioning, take full screen except header/footer space
        isMaximized
          ? 'fixed inset-0 top-16 bottom-16 md:bottom-4 max-w-none m-0 z-40' // Adjust top/bottom as needed
          // Normal: Default flow, maybe some margin
          : 'relative max-w-5xl mx-auto mt-8' // Restore original margin/max-width
      )}
    >
      <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4 sticky top-0 z-10"> {/* Make header sticky */}
        <div className="flex items-center">
          <WindowControls
            onClose={closeWindow}
            onMinimize={minimizeWindow}
            onMaximize={maximizeWindow} // Pass the correct maximize function
          />
          <h1 className="text-xl font-mono ml-4">~/project-sandbox</h1>
        </div>
      </div>
      {/* Render the server component content here */}
      {/* Add overflow-y-auto for scrollable content when maximized */}
      <div className={cn("h-full", isMaximized ? "overflow-y-auto" : "")}>
        <ProjectsContent />
      </div>
    </div>
  );
}
