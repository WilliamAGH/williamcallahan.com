/**
 * Education Card Server Component
 * @module components/features/education/education-card.server
 * @description
 * Server component that handles logo fetching and processing for education entries.
 * Uses direct logo fetching to work during build time.
 */

import type { Education } from '../../../types/education';
import { EducationCardClient } from './education-card.client';
import { fetchLogo, normalizeDomain } from '../../../lib/logo-fetcher';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { JSX } from "react";

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
 * Education Card Server Component
 * @param {Education} props - Education entry properties
 * @returns {Promise<JSX.Element>} Pre-rendered education card with fetched logo
 */
export async function EducationCard(props: Education): Promise<JSX.Element> {
  const { website, institution, logo } = props;

  try {
    // If logo is provided directly, use it
    if (logo) {
      return <EducationCardClient {...props} logoData={{ src: logo, source: null }} />;
    }

    // Get domain from website or institution name
    const domain = website ? normalizeDomain(website) : normalizeDomain(institution);

    // Fetch logo directly (works during build)
    const result = await fetchLogo(domain);

    if (result.buffer) {
      // Convert buffer to data URL for client
      const base64 = result.buffer.toString('base64');
      const mimeType = result.buffer[0] === 0x3c ? 'image/svg+xml' : 'image/png';
      const dataUrl = `data:${mimeType};base64,${base64}`;

      return <EducationCardClient
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
    return <EducationCardClient
      {...props}
      logoData={{
        src: `data:image/svg+xml;base64,${base64}`,
        source: null
      }}
    />;
  } catch (error) {
    console.error('Error in EducationCard:', error);
    // Return placeholder on any error
    const placeholder = await getPlaceholder();
    const base64 = placeholder.toString('base64');
    return <EducationCardClient
      {...props}
      logoData={{
        src: `data:image/svg+xml;base64,${base64}`,
        source: null
      }}
    />;
  }
}
