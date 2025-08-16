/**
 * Education Card Server Component
 * @module components/features/education/education-card.server
 * @description
 * Server component that handles logo fetching and processing for education entries.
 * Uses direct logo fetching to work during build time.
 */

import type { Education } from "@/types";
import type { JSX } from "react";
import { EducationCardClient } from "./education-card.client";
import { processEducationItem } from "@/lib/education-data-processor";

/**
 * Education Card Server Component
 * @param {Education} props - Education entry properties
 * @returns {JSX.Element} Pre-rendered education card
 */
export async function EducationCard(props: Education): Promise<JSX.Element> {
  try {
    const educationWithLogo = await processEducationItem(props);
    return <EducationCardClient education={educationWithLogo} />;
  } catch (error) {
    console.error("Failed to process education item:", error);
    // Fallback to default logo data
    const fallbackEducation = { ...props, logoData: { url: "", source: null } };
    return <EducationCardClient education={fallbackEducation} />;
  }
}
