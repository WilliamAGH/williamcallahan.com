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

/**
 * Education Card Server Component
 * @param {Education} props - Education entry properties
 * @returns {JSX.Element} Pre-rendered education card
 */
export function EducationCard(props: Education): JSX.Element {
  return <EducationCardClient education={props} />;
}
