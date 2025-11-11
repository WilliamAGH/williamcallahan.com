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

const LOGO_PROCESSING_BATCH_SIZE = 6;

async function processWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return [];

  const results: R[] = [];
  for (let index = 0; index < items.length; index += limit) {
    const slice = items.slice(index, index + limit);
    const mapped = await Promise.all(slice.map(mapper));
    results.push(...mapped);
  }

  return results;
}

// Make the component async again to use await for processing
export async function Education({ isDarkTheme }: { isDarkTheme?: boolean } = {}): Promise<JSX.Element> {
  // Process all items concurrently using the server-only functions
  const processedEducation = await processWithConcurrency(education, LOGO_PROCESSING_BATCH_SIZE, item =>
    processEducationItem(item, { isDarkTheme }),
  );

  const processedRecentCourses = (
    await processWithConcurrency(recentCourses, LOGO_PROCESSING_BATCH_SIZE, item =>
      processCertificationItem(item, { isDarkTheme }),
    )
  ).map(course => ({ ...course, type: "course" as const }));

  const processedCertifications = (
    await processWithConcurrency(certifications, LOGO_PROCESSING_BATCH_SIZE, item =>
      processCertificationItem(item, { isDarkTheme }),
    )
  ).map(cert => ({ ...cert, type: "certification" as const }));

  // Pass the processed data (including logoData) to the client component
  return (
    <EducationClient
      education={processedEducation}
      recentCourses={processedRecentCourses}
      recentCertifications={processedCertifications}
    />
  );
}
