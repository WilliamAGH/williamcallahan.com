/**
 * Experience Card Server Component
 * @module components/ui/experience-card/experience-card.server
 * @description
 * Server component that handles logo fetching and processing for experience entries.
 */

import { ServerCache } from '../../../lib/server-cache';
import type { Experience } from '../../../types/experience';
import { ExperienceCardClient } from './experience-card.client';

/**
 * Get logo data for an experience entry
 * @param {string | undefined} website - Company website URL
 * @param {string} company - Company name
 * @param {string | undefined} logo - Optional direct logo URL
 * @returns {Promise<{url: string, source: string | null}>} Logo data with URL and source
 */
async function getLogoData(website: string | undefined, company: string, logo: string | undefined): Promise<{url: string, source: string | null}> {
  // If logo is provided directly, use it
  if (logo) {
    return {
      url: logo,
      source: null
    };
  }

  // During build/production, return placeholder immediately
  if (process.env.NODE_ENV === 'production') {
    return {
      url: '/images/company-placeholder.svg',
      source: null
    };
  }

  try {
    // Try to get from server cache first
    const domain = website
      ? website.startsWith('http')
        ? new URL(website).hostname.replace('www.', '')
        : website.replace(/^www\./, '').split('/')[0]
      : company.toLowerCase().replace(/\s+/g, '');

    const cached = ServerCache.getLogoFetch(domain);
    if (cached?.buffer) {
      return {
        url: `/api/logo?${website ? `website=${encodeURIComponent(website)}` : `company=${encodeURIComponent(company)}`}`,
        source: cached.source
      };
    }

    // If not in cache, fetch it server-side
    const apiUrl = `/api/logo?${website ? `website=${encodeURIComponent(website)}` : `company=${encodeURIComponent(company)}`}`;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const response = await fetch(`${siteUrl}${apiUrl}`, {
      redirect: 'manual', // Don't follow redirects
      next: { revalidate: 3600 } // Cache for 1 hour
    });

    // If we get a redirect, it means no logo was found
    if (response.status === 307) {
      return {
        url: '/images/company-placeholder.svg',
        source: null
      };
    }

    // For successful responses
    if (response.ok) {
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
    }

    // For any other error
    console.error(`Failed to fetch logo for ${domain}: ${response.status}`);
    return {
      url: '/images/company-placeholder.svg',
      source: null
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
 * Experience Card Server Component
 * @param {Experience} props - Experience entry properties
 * @returns {Promise<JSX.Element>} Pre-rendered experience card with server-fetched logo
 */
// Force static generation
export const dynamic = 'force-static';

export async function ExperienceCard(props: Experience): Promise<JSX.Element> {
  const { website, company, logo } = props;
  const logoData = await getLogoData(website, company, logo);

  return <ExperienceCardClient {...props} logoData={logoData} />;
}
