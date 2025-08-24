/**
 * Education Server Component
 * @module components/features/education/education.server
 * @description
 * Server component that fetches education data and processes logos using server-only functions.
 */
import "server-only"; // Ensure this component also remains server-only

import { certifications, education, recentCourses } from "../../../data/education";
// Import the new server-only processing functions
import { processCertificationItem, processEducationItem } from "../../../lib/education-data-processor";
import { EducationClient } from "./education.client";

import type { JSX } from "react";

// Make the component async again to use await for processing
export async function Education({ isDarkTheme }: { isDarkTheme?: boolean } = {}): Promise<JSX.Element> {
  // Process all items concurrently using the server-only functions
  const [processedEducation, processedRecentCourses, processedCertifications] = await Promise.all([
    Promise.all(education.map(item => processEducationItem(item, { isDarkTheme }))),
    Promise.all(recentCourses.map(item => processCertificationItem(item, { isDarkTheme }))).then(courses =>
      courses.map(course => ({ ...course, type: "course" as const })),
    ),
    Promise.all(certifications.map(item => processCertificationItem(item, { isDarkTheme }))).then(certs =>
      certs.map(cert => ({ ...cert, type: "certification" as const })),
    ),
  ]);

  // Pass the processed data (including logoData) to the client component
  return (
    <EducationClient
      education={processedEducation}
      recentCourses={processedRecentCourses}
      recentCertifications={processedCertifications}
    />
  );
}
