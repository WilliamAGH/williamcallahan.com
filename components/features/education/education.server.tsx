/**
 * Education Server Component
 * @module components/features/education/education.server
 * @description
 * Server component that handles pre-fetching of logos and data for the education section.
 * This component fetches and processes all logos on the server side before passing
 * the pre-rendered cards to the client component.
 *
 * @example
 * ```tsx
 * // In a page component
 * export default function Page() {
 *   return <Education />;
 * }
 * ```
 */

import { EducationCard } from '../../../components/features/education/education-card.server';
import { CertificationCard } from '../../../components/features/education/certification-card.server';
import { education, certifications, highlightedCertifications } from '../../../data/education';
import { EducationClient } from '../../../components/features/education/education.client';

/**
 * Education Server Component
 * @returns {Promise<JSX.Element>} Pre-rendered education section with server-fetched logos
 */
export async function Education(): Promise<JSX.Element> {
  // Pre-fetch all logos on the server
  const educationWithLogos = await Promise.all(
    education.map(async (edu) => {
      const card = await EducationCard(edu);
      return { ...edu, card };
    })
  );

  const highlightedCertsWithLogos = await Promise.all(
    highlightedCertifications.map(async (cert) => {
      const card = await CertificationCard(cert);
      return { ...cert, card };
    })
  );

  const certificationsWithLogos = await Promise.all(
    certifications.map(async (cert) => {
      const card = await CertificationCard(cert);
      return { ...cert, card };
    })
  );

  return (
    <EducationClient
      education={educationWithLogos}
      highlightedCertifications={highlightedCertsWithLogos}
      certifications={certificationsWithLogos}
    />
  );
}
