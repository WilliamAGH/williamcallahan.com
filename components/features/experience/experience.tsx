/**
 * Experience Section Component
 *
 * Displays a list of professional experience entries in a styled container.
 * Each entry includes company details, role information, and duration.
 * The component uses a consistent layout with the Education section,
 * featuring window controls and a max-width container.
 *
 * @returns {JSX.Element} A styled container with experience entries
 */

import { ExperienceCard } from "@/components/ui/experience-card/experience-card.server";
import { WindowControls } from "@/components/ui/navigation/windowControls";
import { experiences } from "@/data/experience";
import type { Experience as ExperienceType } from "@/types";

// Force static generation
export const dynamic = 'force-static';

export async function Experience(): Promise<JSX.Element> {
  // Pre-render each experience card
  const experienceCards = await Promise.all(
    experiences.map(async (exp: ExperienceType) => ({
      ...exp,
      card: await ExperienceCard(exp)
    }))
  );

  return (
    <div className="max-w-5xl mx-auto mt-8">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4">
          <div className="flex items-center">
            <WindowControls />
            <h1 className="text-base sm:text-lg md:text-xl font-mono ml-4 truncate min-w-0">~/experience</h1>
          </div>
        </div>

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
      </div>
    </div>
  );
}
