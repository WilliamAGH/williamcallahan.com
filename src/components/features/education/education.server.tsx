/**
 * Education Server Component
 * @module components/features/education/education.server
 * @description
 * Server component that fetches education data and processes logos using server-only functions.
 */
import "server-only"; // Ensure this component also remains server-only

import { certifications, education, recentCourses } from "@/data/education";
// Import the new server-only processing functions
import { processCertificationItem, processEducationItem } from "@/lib/education-data-processor";
import { EducationClient } from "./education.client";
import { mapWithBoundedConcurrency } from "@/lib/utils/async-lock";

import type { JSX } from "react";

const LOGO_PROCESSING_BATCH_SIZE = 6;

// Make the component async again to use await for processing
export async function Education({
  isDarkTheme,
}: { isDarkTheme?: boolean } = {}): Promise<JSX.Element> {
  // Process all items concurrently using the server-only functions
  const processedEducation = await mapWithBoundedConcurrency(
    education,
    LOGO_PROCESSING_BATCH_SIZE,
    (item) => processEducationItem(item, { isDarkTheme }),
  );

  const recentCoursesResults = await mapWithBoundedConcurrency(
    recentCourses,
    LOGO_PROCESSING_BATCH_SIZE,
    (item) => processCertificationItem(item, { isDarkTheme }),
  );
  const processedRecentCourses = recentCoursesResults.map((course) => ({
    ...course,
    type: "course" as const,
  }));

  const certificationsResults = await mapWithBoundedConcurrency(
    certifications,
    LOGO_PROCESSING_BATCH_SIZE,
    (item) => processCertificationItem(item, { isDarkTheme }),
  );
  const processedCertifications = certificationsResults.map((cert) => ({
    ...cert,
    type: "certification" as const,
  }));

  // Pass the processed data (including logoData) to the client component
  return (
    <EducationClient
      education={processedEducation}
      recentCourses={processedRecentCourses}
      recentCertifications={processedCertifications}
    />
  );
}
