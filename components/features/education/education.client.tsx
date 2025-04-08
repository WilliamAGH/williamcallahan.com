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
"use client";

import { useEffect, useState } from 'react'; // Import hooks
import { WindowControls } from '../../../components/ui/navigation/window-controls';
import type { Education, Certification, Class } from '../../../types/education';
import { useRegisteredWindowState } from "@/lib/context/GlobalWindowRegistryContext"; // Use new hook
import { GraduationCap } from 'lucide-react'; // Import specific icon
import { cn } from '@/lib/utils'; // Import cn utility
import { EducationCardClient } from './education-card.client';
import { CertificationCardClient } from './certification-card.client';
import type { LogoData } from '../../../lib/education-data-processor';

// Define a unique ID for this window instance
const EDUCATION_WINDOW_ID = 'education-window';

/**
 * Props for the Education Client Component
 * @interface
 */
interface EducationClientProps {
  // Updated props to accept processed data (includes logoData)
  education: (Education & { logoData: LogoData })[];
  recentCourses: (Class & { logoData: LogoData })[];
  certifications: (Certification & { logoData: LogoData })[];
}

/**
 * Education Client Component
 * @param {EducationClientProps} props - Component properties
 * @returns {JSX.Element} Rendered education section with client-side cards and window controls
 */
export function EducationClient({
  education,
  recentCourses,
  certifications
}: EducationClientProps) {
  // Register this window instance and get its state/actions
  const {
    windowState,
    close: closeWindow,
    minimize: minimizeWindow,
    maximize: maximizeWindow,
    isRegistered
  } = useRegisteredWindowState(EDUCATION_WINDOW_ID, GraduationCap, 'Restore Education', 'normal');

  // Log state changes (optional)
  useEffect(() => {
    if (isRegistered) { // Check isRegistered
      console.log(`EducationClient Render (${EDUCATION_WINDOW_ID}) - Window State:`, windowState);
    }
  }, [windowState, isRegistered]); // Dependency on isRegistered

  // Render nothing until ready
  if (!isRegistered) { // Check isRegistered
     return <></>; // Or a suitable skeleton/placeholder
  }

  // Handle closed state
  if (windowState === "closed") {
    return <></>;
  }

  // Handle minimized state
  // This is now handled by the FloatingRestoreButtons component
  if (windowState === "minimized") {
    return <></>;
  }

  // Render normal or maximized view
  const isMaximized = windowState === 'maximized';

  // Refactored structure to match ProjectsClient (single main wrapper)
  return (
    <div className={cn(
      // Base styles
      "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 overflow-hidden",
      "transition-all duration-300 ease-in-out", // Optional: Add transition like projects
      // Normal state styles
      "relative max-w-5xl mx-auto mt-8 rounded-lg shadow-lg",
      // Maximized state overrides
      isMaximized &&
        "fixed inset-0 z-[60] max-w-none m-0 rounded-none shadow-none flex flex-col h-full top-16 bottom-16 md:bottom-4" // Adjust insets if needed
    )}>
      {/* Sticky Header (remains the same) */}
      <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4 flex-shrink-0 sticky top-0 z-10">
        <div className="flex items-center">
          <WindowControls
            onClose={closeWindow}
            onMinimize={minimizeWindow}
            onMaximize={maximizeWindow}
          />
          <h1 className="text-xl font-mono ml-4">~/education</h1>
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div className={cn(
        "p-6",
        // Apply overflow and flex-grow only when maximized
        isMaximized ? "overflow-y-auto flex-grow" : ""
      )}>
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-6">Highlighted & Recent Courses</h2>
          <div className="space-y-6">
            {/* Render CertificationCardClient directly with processed data */}
            {recentCourses.map((course) => (
              <CertificationCardClient key={course.id} {...course} />
            ))}
          </div>
        </div>

        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-6">University Degrees</h2>
          <div className="space-y-6">
            {/* Render EducationCardClient directly with processed data */}
            {education.map((edu) => (
              <EducationCardClient key={edu.id} {...edu} />
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-bold mb-6">Certifications & Continuing Studies</h2>
          <div className="space-y-6">
            {/* Render CertificationCardClient directly with processed data */}
            {certifications.map((cert) => (
              <CertificationCardClient key={cert.id} {...cert} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
