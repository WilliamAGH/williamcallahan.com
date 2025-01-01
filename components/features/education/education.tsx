/**
 * Education Section Component
 */

"use client";

import { WindowControls } from 'components/ui/navigation/window-controls';
import { EducationCard } from './education-card';
import { CertificationCard } from './certification-card';
import { education, certifications, highlightedCertifications } from 'data/education';

export function Education() {
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
                <CertificationCard key={cert.id} {...cert} />
              ))}
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-6">University Degrees</h2>
            <div className="space-y-6">
              {education.map((edu) => (
                <EducationCard key={edu.id} {...edu} />
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-bold mb-6">Certifications & Continuing Studies</h2>
            <div className="space-y-6">
              {certifications.map((cert) => (
                <CertificationCard key={cert.id} {...cert} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
