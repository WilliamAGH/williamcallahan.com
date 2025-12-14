/**
 * Experience Section Component - Client Wrapper
 * @module components/features/experience/experience.client
 * @description
 * Client component for the experience section.
 * Manages the window state (minimize, maximize, close) for the experience section.
 * Renders the ExperienceContent server component within a window frame.
 */

"use client";

import React, { useEffect } from "react";
import { useRegisteredWindowState } from "@/lib/context/global-window-registry-context.client";
import { cn } from "@/lib/utils"; // Import cn utility
import { Briefcase } from "lucide-react"; // Import specific icon
import type { ExperienceProps } from "@/types/features/experience";
import { WindowControls } from "@/components/ui/navigation/window-controls";
import { ExperienceCardClient } from "@/components/ui/experience-card/experience-card.client";
// ReactElement type is no longer explicitly imported if JSX.Element is used directly

/**
 * Unique identifier for the experience window instance in the global window registry.
 * @internal
 */
const EXPERIENCE_WINDOW_ID = "experience-window";

// Force static generation for the content component if possible (may need adjustment)
// export const dynamic = 'force-static'; // This directive likely belongs with data fetching/rendering logic

/**
 * Client component wrapper for the Experience section.
 * This component manages the window state (visibility, minimize, maximize) for the experience display
 * using the `useRegisteredWindowState` hook. It renders the provided `experienceCards`
 * within a macOS-style window frame.
 *
 * @param {ExperienceProps} props - The props for the component.
 * @returns {JSX.Element} The rendered experience section within a window, or an empty fragment if closed or minimized.
 */
export function Experience({ data }: ExperienceProps): React.JSX.Element | null {
  // Register this window instance and get its state/actions
  const {
    windowState,
    close: closeWindow,
    minimize: minimizeWindow,
    maximize: maximizeWindow,
    isRegistered,
  } = useRegisteredWindowState(EXPERIENCE_WINDOW_ID, Briefcase, "Restore Experience", "normal");

  // Log state changes (optional)
  useEffect(() => {
    if (isRegistered) {
      // Check isRegistered
      console.log(`Experience Component Render (${EXPERIENCE_WINDOW_ID}) - Window State:`, windowState);
    }
  }, [windowState, isRegistered]); // Dependency on isRegistered

  // Render nothing until ready
  if (!isRegistered) {
    // Check isRegistered
    return null;
  }

  // Handle closed state
  if (windowState === "closed") {
    return null;
  }

  // Handle minimized state
  // This is now handled by the FloatingRestoreButtons component
  if (windowState === "minimized") {
    return null;
  }

  // Render normal or maximized view
  const isMaximized = windowState === "maximized";

  // Refactored structure to match other clients (single main wrapper)
  return (
    <div
      className={cn(
        // Base styles
        "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 overflow-hidden",
        "transition-all duration-300 ease-in-out",
        // Normal state styles
        "relative max-w-5xl mx-auto mt-8 rounded-lg shadow-lg",
        // Maximized state overrides
        isMaximized &&
          "fixed inset-0 z-[60] max-w-none m-0 rounded-none shadow-none flex flex-col h-full top-16 bottom-16 md:bottom-4",
      )}
    >
      {/* Sticky Header */}
      <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4 flex-shrink-0 sticky top-0 z-10">
        <div className="flex items-center">
          <WindowControls onClose={closeWindow} onMinimize={minimizeWindow} onMaximize={maximizeWindow} />
          <h1 className="text-xl font-mono ml-4">~/experience</h1>
        </div>
      </div>
      {/* Scrollable Content Area */}
      <div className={cn("p-6", isMaximized ? "overflow-y-auto flex-grow" : "")}>
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-6">Experience</h2>
          <div className="space-y-6">
            {data.map(item => (
              <ExperienceCardClient key={item.id} {...item} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
