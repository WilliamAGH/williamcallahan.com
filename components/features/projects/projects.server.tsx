"use client"; // Make this a Client Component wrapper

/**
 * Projects Section Component - Client Wrapper
 *
 * Manages the window state (minimize, maximize, close) for the Projects section.
 * Renders the ProjectsContent server component within a window frame.
 */

import { useEffect, useState, Suspense } from 'react'; // Import hooks
import Link from 'next/link';
import { projects } from '@/data/projects';
import { ProjectCardServer } from './project-card.server';
import { WindowControls } from '@/components/ui/navigation/window-controls';
import GitHubActivity from '@/components/features/github/github-activity';
import { useWindowState, WindowState } from '@/lib/hooks/use-window-state'; // Import hook and type
import { cn } from '@/lib/utils'; // Import cn utility

// Define a unique ID for this window instance
const PROJECTS_WINDOW_ID = 'projects-window';

// --- Server Component for Content ---
// Renders the actual content of the projects page
// This component can remain a Server Component
function ProjectsContent() {
  return (
    <div className="p-6"> {/* Inner padding */}
      {/* Intro Text Section */}
      <div className="prose dark:prose-invert max-w-none mb-8">
        <p>
          Welcome to my a sandbox of my various experiments / projects / works-in-progress. Be sure to visit my{' '}
          <Link href="/experience" className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300">
            experience page
          </Link>{' '}
          if you&apos;d like a better look at some of my more &apos;complete&apos; work as well.
        </p>
      </div>

      {/* GitHub Activity Section - Use Suspense if it fetches data */}
      <Suspense fallback={<div>Loading GitHub activity...</div>}>
        <GitHubActivity />
      </Suspense>

      {/* Project Cards List */}
      <div className="space-y-6 mt-8"> {/* Added margin-top to separate from graph */}
        {projects.map((project) => (
          // Assuming ProjectCardServer is compatible with server rendering
          <ProjectCardServer key={project.name} project={project} />
        ))}
      </div>

    </div>
  );
}

// --- Client Component Wrapper ---
// Exported component is now the wrapper, renamed from ProjectsServer
export function ProjectsClient() { // Renamed to avoid conflict and indicate client nature
  // Use the window state hook
  const {
    windowState,
    closeWindow,
    minimizeWindow,
    maximizeWindow,
    isReady // Use isReady for hydration safety
  } = useWindowState(PROJECTS_WINDOW_ID, 'normal');

  // Log state changes (optional)
  useEffect(() => {
    if (isReady) {
      console.log(`ProjectsClient Render (${PROJECTS_WINDOW_ID}) - Window State:`, windowState);
    }
  }, [windowState, isReady]);

  // Render nothing until ready
  if (!isReady) {
     return <></>; // Or a suitable skeleton/placeholder
  }

  // Handle closed state
  if (windowState === "closed") {
    return <></>;
  }

  // Handle minimized state
  if (windowState === "minimized") {
    return (
      <div className="max-w-5xl mx-auto mt-8">
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4">
            <div className="flex items-center">
              <WindowControls
                onClose={closeWindow}
                onMinimize={minimizeWindow}
                onMaximize={maximizeWindow}
              />
              <h1 className="text-xl font-mono ml-4">~/project-sandbox (Minimized)</h1>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render normal or maximized view
  return (
    <div className="max-w-5xl mx-auto mt-8">
      <div className={cn(
          "bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden",
          // windowState === 'maximized' ? 'max-w-full' : ''
      )}>
        <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4">
          <div className="flex items-center">
            <WindowControls
              onClose={closeWindow}
              onMinimize={minimizeWindow}
              onMaximize={maximizeWindow}
            />
            <h1 className="text-xl font-mono ml-4">~/project-sandbox</h1> {/* Title from original */}
          </div>
        </div>
        {/* Render the server component content here */}
        <ProjectsContent />
      </div>
    </div>
  );
}
