/**
 * Experience Card Server Component
 * @module components/ui/experience-card/experience-card.server
 * @description
 * Server component that handles logo fetching and processing for experience entries.
 * Uses direct logo fetching to work during build time.
 */

import type { Experience } from '../../../types/experience';
import { ExperienceCardClient } from './experience-card.client';
import { fetchLogo, normalizeDomain } from '../../../lib/logo-fetcher';

// Define the path to the static placeholder image
const PLACEHOLDER_IMAGE_URL = '/images/company-placeholder.svg';

/**
 * Experience Card Server Component
 * @param {Experience} props - Experience entry properties
 * @returns {Promise<JSX.Element>} Pre-rendered experience card with fetched logo
 */
export async function ExperienceCard(props: Experience): Promise<JSX.Element> {
  const { website, company, logo } = props;

  try {
    // If logo is provided directly, use it
    if (logo) {
      return <ExperienceCardClient {...props} logoData={{ url: logo, source: null }} />;
    }

    // Get domain from website or company name
    const domain = website ? normalizeDomain(website) : normalizeDomain(company);

    // Fetch logo directly (works during build)
    const result = await fetchLogo(domain);

    if (result.buffer) {
      // Convert buffer to data URL for client
      const base64 = result.buffer.toString('base64');
      const mimeType = result.buffer[0] === 0x3c ? 'image/svg+xml' : 'image/png';
      const dataUrl = `data:${mimeType};base64,${base64}`;

      return <ExperienceCardClient
        {...props}
        logoData={{
          url: dataUrl,
          source: result.source
        }}
      />;
    }

    // Use placeholder for failed fetches
    return <ExperienceCardClient
      {...props}
      logoData={{
        url: PLACEHOLDER_IMAGE_URL, // Use the static path
        source: null
      }}
    />;
  } catch (error) {
    console.error('Error in ExperienceCard:', error);
    // Return placeholder on any error
    return <ExperienceCardClient
      {...props}
      logoData={{
        url: PLACEHOLDER_IMAGE_URL, // Use the static path
        source: null
      }}
    />;
  }
}
