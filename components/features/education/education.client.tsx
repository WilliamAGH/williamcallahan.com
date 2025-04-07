"use client";

/**
 * Education Client Component
 * @module components/features/education/education.client
 * @description
 * Client component that handles the display and interaction for the education section.
 * Receives pre-rendered cards with server-fetched logos from the server component.
 * Manages window state (minimize, maximize, close).
 *
 * @example
 * ```tsx
 * <EducationClient
 *   education={educationWithLogos}
 *   recentCourses={recentCoursesWithLogos}
 *   certifications={certificationsWithLogos}
 * />
 * ```
 */

import { useEffect, useState } from 'react'; // Import hooks
import { WindowControls } from '../../../components/ui/navigation/window-controls';
import type { Education, Certification, Class } from '../../../types/education';
import { useWindowState, WindowState } from '@/lib/hooks/use-window-state'; // Import hook and type
import { cn } from '@/lib/utils'; // Import cn utility

// Define a unique ID for this window instance
const EDUCATION_WINDOW_ID = 'education-window';

/**
 * Props for the Education Client Component
 * @interface
 */
interface EducationClientProps {
  /** Education entries with pre-rendered cards */
  education: (Education & { card: JSX.Element })[];
  /** Recent course entries with pre-rendered cards */
  recentCourses: (Class & { card: JSX.Element })[];
  /** Regular certification entries with pre-rendered cards */
  certifications: (Certification & { card: JSX.Element })[];
}

/**
 * Education Client Component
 * @param {EducationClientProps} props - Component properties
 * @returns {JSX.Element} Rendered education section with pre-rendered cards and window controls
 */
export function EducationClient({
  education,
  recentCourses,
  certifications
}: EducationClientProps) {
  // Use the window state hook
  const {
    windowState,
    closeWindow,
    minimizeWindow,
    maximizeWindow,
    isReady // Use isReady for hydration safety
  } = useWindowState(EDUCATION_WINDOW_ID, 'normal');

  // Log state changes (optional)
  useEffect(() => {
    if (isReady) {
      console.log(`EducationClient Render (${EDUCATION_WINDOW_ID}) - Window State:`, windowState);
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
              <h1 className="text-xl font-mono ml-4">~/education (Minimized)</h1>
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
            <h1 className="text-xl font-mono ml-4">~/education</h1>
          </div>
        </div>

        <div className="p-6">
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-6">Highlighted & Recent Courses</h2>
            <div className="space-y-6">
              {recentCourses.map((course) => (
                <div key={course.id}>{course.card}</div>
              ))}
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-6">University Degrees</h2>
            <div className="space-y-6">
              {education.map((edu) => (
                <div key={edu.id}>{edu.card}</div>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold mb-6">Certifications & Continuing Studies</h2>
            <div className="space-y-6">
              {certifications.map((cert) => (
                <div key={cert.id}>{cert.card}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
