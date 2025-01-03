/**
 * Education Card Server Component
 * @module components/features/education/education-card.server
 * @description
 * Server component that handles logo fetching and processing for education entries.
 * Uses ServerCache for efficient logo caching and processing.
 *
 * @example
 * ```tsx
 * const card = await EducationCard({
 *   institution: "UC Berkeley",
 *   website: "berkeley.edu",
 *   // ... other education props
 * });
 * ```
 */

import { ServerCache } from '../../../lib/server-cache';
import type { Education } from '../../../types/education';
import { EducationCardClient } from '../../../components/features/education/education-card.client';

/**
 * Get logo data for an education entry
 * @param {string | undefined} website - Institution's website URL
 * @param {string} institution - Institution name
 * @param {string | undefined} logo - Optional direct logo URL
 * @returns {Promise<{url: string, source: string | null}>} Logo data with URL and source
 */
async function getLogoData(website: string | undefined, institution: string, logo: string | undefined): Promise<{url: string, source: string | null}> {
  // If logo is provided directly, use it
  if (logo) {
    return {
      url: logo,
      source: null
    };
  }

  try {
    // Try to get from server cache first
    const domain = website
      ? website.startsWith('http')
        ? new URL(website).hostname.replace('www.', '')
        : website.replace(/^www\./, '').split('/')[0]
      : institution.toLowerCase().replace(/\s+/g, '');

    const cached = ServerCache.getLogoFetch(domain);
    if (cached?.buffer) {
      return {
        url: `/api/logo?${website ? `website=${encodeURIComponent(website)}` : `company=${encodeURIComponent(institution)}`}`,
        source: cached.source
      };
    }

    // If not in cache, fetch it server-side
    const apiUrl = `/api/logo?${website ? `website=${encodeURIComponent(website)}` : `company=${encodeURIComponent(institution)}`}`;
    const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}${apiUrl}`);

    if (!response.ok) {
      console.error(`Failed to fetch logo for ${domain}: ${response.status}`);
      return {
        url: '/images/company-placeholder.svg',
        source: null
      };
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type');
    const source = response.headers.get('x-logo-source');

    // Cache the result
    ServerCache.setLogoFetch(domain, {
      url: null,
      source: source as any,
      buffer
    });

    return {
      url: apiUrl,
      source: source
    };
  } catch (error) {
    console.error('Error fetching logo:', error);
    return {
      url: '/images/company-placeholder.svg',
      source: null
    };
  }
}

/**
 * Education Card Server Component
 * @param {Education} props - Education entry properties
 * @returns {Promise<JSX.Element>} Pre-rendered education card with server-fetched logo
 */
export async function EducationCard(props: Education): Promise<JSX.Element> {
  const { website, institution, logo } = props;
  const logoData = await getLogoData(website, institution, logo);

  return <EducationCardClient {...props} logoData={logoData} />;
}
