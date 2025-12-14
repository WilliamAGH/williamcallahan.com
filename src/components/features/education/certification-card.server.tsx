/**
 * Certification Card Server Component
 * @module components/features/education/certification-card.server
 * @description
 * Server component that handles logo fetching and processing for certification entries.
 * Uses direct logo fetching to work during build time.
 */

import type { Certification } from "@/types/education";
import type { JSX } from "react";
import { CertificationCardClient } from "./certification-card.client";

/**
 * Certification Card Server Component
 * @param {Certification} props - Certification entry properties
 * @returns {Promise<JSX.Element>} Pre-rendered certification card with fetched logo
 */
export function CertificationCard(props: Certification): JSX.Element {
  return <CertificationCardClient certification={props} />;
}
