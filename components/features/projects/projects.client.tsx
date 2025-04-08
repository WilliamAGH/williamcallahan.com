/**
 * Projects Section Component - Client Wrapper
 *
 * Manages the window state (minimize, maximize, close) for the Projects section.
 * Renders the ProjectsContent server component within a window frame.
 */

"use client";

import { useEffect, Suspense, useState, useMemo } from 'react'; // Added useState, useMemo
// Removed framer-motion imports
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
// --- Helper to get unique tags ---
const getAllUniqueTags = () => {
  const allTags = projects.flatMap(p => p.tags || []);
  return ['All', ...Array.from(new Set(allTags)).sort()];
};

// --- Server Component for Content ---
// (Now needs props for filtered projects and tag handling)
interface ProjectsContentProps {
  filteredProjects: typeof projects;
  allTags: string[];
  selectedTag: string;
  onSelectTag: (tag: string) => void;
}

function ProjectsContent({ filteredProjects, allTags, selectedTag, onSelectTag }: ProjectsContentProps) {
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

      {/* Filter Buttons */}
      <div className="mb-8 flex flex-wrap gap-2">
        {allTags.map(tag => (
          <button
            key={tag}
            onClick={() => onSelectTag(tag)}
            className={cn(
              "px-3 py-1 rounded-full text-sm font-medium transition-colors duration-200",
              selectedTag === tag
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            )}
          >
            {tag}
          </button>
        ))}
      </div>

      <Suspense fallback={<div>Loading GitHub activity...</div>}>
        <GitHubActivity />
      </Suspense>

      {/* Use a vertical stack layout for single column */}
      <div className="space-y-8 mt-8">
        {/* Map over filtered projects and add stagger using inline style for CSS animation */}
        {filteredProjects.map((project, index) => (
          // Keep the wrapper div for applying animation delay
          <div key={project.name} style={{ animationDelay: `${index * 100}ms` }}>
            <ProjectCardServer project={project} />
          </div>
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

  // State for filtering
  const [selectedTag, setSelectedTag] = useState<string>('All');

  // Memoize tags and filtered projects
  const allTags = useMemo(() => getAllUniqueTags(), []);
  const filteredProjects = useMemo(() => {
    if (selectedTag === 'All') {
      return projects;
    }
    return projects.filter(p => p.tags?.includes(selectedTag));
  }, [selectedTag]);


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
        {/* Pass necessary props to ProjectsContent */}
        <ProjectsContent
          filteredProjects={filteredProjects}
          allTags={allTags}
          selectedTag={selectedTag}
          onSelectTag={setSelectedTag}
        />
      </div>
    </div>
  );
}
