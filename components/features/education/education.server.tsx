'use server';

/**
 * Education Server Component
 * @module components/features/education/education.server
 * @description
 * Server component that handles pre-rendering education and certification cards.
 */

import { WindowControls } from "../../ui/navigation/windowControls";
import { EducationCard } from "./education-card.server";
import { CertificationCard } from "./certification-card.server";
import { education, certifications, recentCourses } from "../../../data/education";
import type { Education as EducationType, Certification, Class } from "../../../types/education";
import { generateEducationKey } from "../../../lib/utils/stableKeys";

export async function Education(): Promise<JSX.Element> {
  // Pre-render education cards with stable keys
  const educationCards = await Promise.all(
    education.map(async (edu: EducationType) => {
      const withKey = {
        ...edu,
        stableKey: generateEducationKey(edu.id, edu.year, edu.degree)
      };
      return {
        ...withKey,
        card: await EducationCard(withKey)
      };
    })
  );

  // Pre-render recent course cards with stable keys
  const recentCourseCards = await Promise.all(
    recentCourses.map(async (course: Class) => {
      const withKey = {
        ...course,
        stableKey: generateEducationKey(course.id, course.year, course.name)
      };
      return {
        ...withKey,
        card: await CertificationCard(withKey)
      };
    })
  );

  // Pre-render certification cards with stable keys
  const certificationCards = await Promise.all(
    certifications.map(async (cert: Certification) => {
      const withKey = {
        ...cert,
        stableKey: generateEducationKey(cert.id, cert.year, cert.name)
      };
      return {
        ...withKey,
        card: await CertificationCard(withKey)
      };
    })
  );

  return (
    <div className="max-w-5xl mx-auto mt-8">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 p-4">
          <div className="flex items-center">
            <WindowControls />
            <h1 className="text-base sm:text-lg md:text-xl font-mono ml-4 truncate min-w-0">~/education</h1>
          </div>
        </div>

        <div className="p-6">
          {/* Recent Courses Section */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-6">Highlighted & Recent Courses</h2>
            <div className="space-y-6">
              {recentCourseCards.map((course) => (
                <div key={course.id} id={course.stableKey}>
                  {course.card}
                </div>
              ))}
            </div>
          </div>

          {/* Education Section */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-6">Education</h2>
            <div className="space-y-6">
              {educationCards.map((edu) => (
                <div key={edu.id} id={edu.stableKey}>
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
                <div key={cert.id} id={cert.stableKey}>
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
