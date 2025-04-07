"use client"; // Make this a Client Component wrapper

/**
 * Experience Section Component - Client Wrapper
 *
 * Manages the window state (minimize, maximize, close) for the Experience section.
 * Renders the ExperienceContent server component within a window frame.
 */

import { useEffect, useState } from 'react'; // Import hooks
import { ExperienceCard } from "../../../components/ui/experience-card/experience-card.server";
import { WindowControls } from "../../../components/ui/navigation/window-controls";
import { experiences } from "../../../data/experience";
import type { Experience as ExperienceType } from "../../../types";
import { useWindowState, WindowState } from '@/lib/hooks/use-window-state'; // Import hook and type
import { cn } from '@/lib/utils'; // Import cn utility

// Define a unique ID for this window instance
const EXPERIENCE_WINDOW_ID = 'experience-window';

// Force static generation for the content component if possible (may need adjustment)
// export const dynamic = 'force-static'; // This directive likely belongs with data fetching/rendering logic

// --- Server Component for Content ---
// Renamed original component to ExperienceContent
async function ExperienceContent(): Promise<JSX.Element> {
  // Pre-render each experience card
  const experienceCards = await Promise.all(
    experiences.map(async (exp: ExperienceType) => ({
      ...exp,
      card: await ExperienceCard(exp) // Assuming ExperienceCard is compatible with server rendering
    }))
  );

  // Removed the outer window frame from the content component
  return (
    <div className="p-6">
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-6">Experience</h2>
        <div className="space-y-6">
        {experienceCards.map((exp) => (
          <div key={exp.company}>
            {exp.card}
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}

// --- Client Component Wrapper ---
// Exported component is now the wrapper
export function Experience(): JSX.Element {
  // Use the window state hook
  const {
    windowState,
    closeWindow,
    minimizeWindow,
    maximizeWindow,
    isReady // Use isReady for hydration safety
  } = useWindowState(EXPERIENCE_WINDOW_ID, 'normal');

  // Log state changes (optional)
  useEffect(() => {
    if (isReady) {
      console.log(`Experience Component Render (${EXPERIENCE_WINDOW_ID}) - Window State:`, windowState);
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
              <h1 className="text-xl font-mono ml-4">~/experience (Minimized)</h1>
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
          // windowState === 'maximized' ? 'max-w-full' : '' // Example for maximized
      )}>
        <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4">
          <div className="flex items-center">
            <WindowControls
              onClose={closeWindow}
              onMinimize={minimizeWindow}
              onMaximize={maximizeWindow}
            />
            <h1 className="text-xl font-mono ml-4">~/experience</h1>
          </div>
        </div>
        {/* Render the server component content here */}
        <ExperienceContent />
      </div>
    </div>
  );
}
