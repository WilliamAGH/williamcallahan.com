import { ServerCache } from '../../../lib/server-cache';
import type { Experience } from '../../../types/experience';
import { ExperienceCardClient } from '../../../components/ui/experience-card/experience-card.client';

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

    // During build, return placeholder immediately since we can't fetch
    if (process.env.NODE_ENV === 'production') {
      return {
        url: '/images/company-placeholder.svg',
        source: null
      };
    }

    // If not in cache, fetch it server-side (development only)
    const apiUrl = `/api/logo?${website ? `website=${encodeURIComponent(website)}` : `company=${encodeURIComponent(company)}`}`;
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
