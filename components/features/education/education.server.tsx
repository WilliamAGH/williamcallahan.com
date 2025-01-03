/**
 * Education Server Component
 * @module components/features/education/education.server
 * @description
 * Server component that handles pre-rendering education and certification cards.
 */

import { WindowControls } from "../../../components/ui/navigation/window-controls";
import { EducationCard } from "./education-card.server";
import { CertificationCard } from "./certification-card.server";
import { education, certifications } from "../../../data/education";
import type { Education as EducationType, Certification } from "../../../types/education";

// Force static generation
export const dynamic = 'force-static';

export async function Education(): Promise<JSX.Element> {
  // Pre-render education cards
  const educationCards = await Promise.all(
    education.map(async (edu: EducationType) => ({
      ...edu,
      card: await EducationCard(edu)
    }))
  );

  // Pre-render certification cards
  const certificationCards = await Promise.all(
    certifications.map(async (cert: Certification) => ({
      ...cert,
      card: await CertificationCard(cert)
    }))
  );

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
          {/* Education Section */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-6">Education</h2>
            <div className="space-y-6">
              {educationCards.map((edu) => (
                <div key={edu.institution}>
                  {edu.card}
                </div>
              ))}
            </div>
          </div>

          {/* Certifications Section */}
          <div>
            <h2 className="text-2xl font-bold mb-6">Certifications</h2>
            <div className="space-y-6">
              {certificationCards.map((cert) => (
                <div key={cert.name}>
                  {cert.card}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
