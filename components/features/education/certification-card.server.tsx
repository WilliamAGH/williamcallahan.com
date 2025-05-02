/**
 * Certification Card Server Component
 * @module components/features/education/certification-card.server
 * @description
 * Server component that handles logo fetching and processing for certification entries.
 * Uses direct logo fetching to work during build time.
 */

import type { Certification } from '../../../types/education';
import { CertificationCardClient } from './certification-card.client';
import { fetchLogo, normalizeDomain } from '../../../lib/logo-fetcher';
import fs from 'node:fs/promises';
import path from 'node:path';

// Cache for placeholder SVG
let placeholderSvg: Buffer | null = null;

/**
 * Get placeholder SVG content
 * @returns {Promise<Buffer>} Placeholder SVG buffer
 */
async function getPlaceholder(): Promise<Buffer> {
  if (!placeholderSvg) {
    placeholderSvg = await fs.readFile(path.join(process.cwd(), 'public/images/company-placeholder.svg'));
  }
  return placeholderSvg;
}

/**
 * Certification Card Server Component
 * @param {Certification} props - Certification entry properties
 * @returns {Promise<JSX.Element>} Pre-rendered certification card with fetched logo
 */
export async function CertificationCard(props: Certification): Promise<JSX.Element> {
  const { website, name, logo } = props;

  try {
    // If logo is provided directly, use it
    if (logo) {
      return <CertificationCardClient {...props} logoData={{ src: logo, source: null }} />;
    }

    // Get domain from website or certification name
    const domain = website ? normalizeDomain(website) : normalizeDomain(name);

    // Fetch logo directly (works during build)
    const result = await fetchLogo(domain);

    if (result.buffer) {
      // Convert buffer to data URL for client
      const base64 = result.buffer.toString('base64');
      const mimeType = result.buffer[0] === 0x3c ? 'image/svg+xml' : 'image/png';
      const dataUrl = `data:${mimeType};base64,${base64}`;

      return <CertificationCardClient
        {...props}
        logoData={{
          src: dataUrl,
          source: result.source
        }}
      />;
    }

    // Use placeholder for failed fetches
    const placeholder = await getPlaceholder();
    const base64 = placeholder.toString('base64');
    return <CertificationCardClient
      {...props}
      logoData={{
        src: `data:image/svg+xml;base64,${base64}`,
        source: null
      }}
    />;
  } catch (error) {
    console.error('Error in CertificationCard:', error);
    // Return placeholder on any error
    const placeholder = await getPlaceholder();
    const base64 = placeholder.toString('base64');
    return <CertificationCardClient
      {...props}
      logoData={{
        src: `data:image/svg+xml;base64,${base64}`,
        source: null
      }}
    />;
  }
}
