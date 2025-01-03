"use client";

/**
 * Education Client Component
 * @module components/features/education/education.client
 * @description
 * Client component that handles the display and interaction for the education section.
 * Receives pre-rendered cards with server-fetched logos from the server component.
 *
 * @example
 * ```tsx
 * <EducationClient
 *   education={educationWithLogos}
 *   highlightedCertifications={highlightedCertsWithLogos}
 *   certifications={certificationsWithLogos}
 * />
 * ```
 */

import { WindowControls } from '../../../components/ui/navigation/window-controls';
import type { Education, Certification } from '../../../types/education';

/**
 * Props for the Education Client Component
 * @interface
 */
interface EducationClientProps {
  /** Education entries with pre-rendered cards */
  /** Highlighted certification entries with pre-rendered cards */
  /** Regular certification entries with pre-rendered cards */
  education: (Education & { card: JSX.Element })[];
  highlightedCertifications: (Certification & { card: JSX.Element })[];
  certifications: (Certification & { card: JSX.Element })[];
}

/**
 * Education Client Component
 * @param {EducationClientProps} props - Component properties
 * @returns {JSX.Element} Rendered education section with pre-rendered cards
 */
export function EducationClient({
  education,
  highlightedCertifications,
  certifications
}: EducationClientProps) {
  return (
    <div className="max-w-5xl mx-auto mt-8">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4">
          <div className="flex items-center">
            <WindowControls />
            <h1 className="text-xl font-mono ml-4">~/education</h1>
          </div>
        </div>

        <div className="p-6">
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-6">Highlighted & Recent Courses</h2>
            <div className="space-y-6">
              {highlightedCertifications.map((cert) => (
                <div key={cert.id}>{cert.card}</div>
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
