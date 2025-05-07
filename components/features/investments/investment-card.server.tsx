/**
 * Investment Card Server Component
 * @module components/features/investments/investment-card.server
 * @description
 * Server component that handles logo fetching and processing for investment entries.
 * Uses direct logo fetching to work during build time.
 */

import type { Investment } from '../../../types/investment';
import { ThemeWrapper } from './theme-wrapper.client';
import { fetchLogo, normalizeDomain } from '../../../lib/logo-fetcher';
import fs from 'fs/promises';
import path from 'path';
import FinancialMetrics from '../../ui/financial-metrics.server';

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
 * Investment Card Server Component
 * @param {Investment} props - Investment entry properties
 * @returns {Promise<JSX.Element>} Pre-rendered investment card with fetched logo
 */
export async function InvestmentCard(props: Investment): Promise<JSX.Element> {
  const { website, name, logo, holding_return } = props;

  // Render FinancialMetrics server-side
  const metricsElement = <FinancialMetrics holding_return={holding_return} />;

  try {
    // If logo is provided directly, use it
    if (logo) {
      return <ThemeWrapper investment={props} logoData={{ url: logo, source: null }} renderedMetrics={metricsElement} />;
    }

    // Get domain from website or company name
    const domain = website ? normalizeDomain(website) : normalizeDomain(name);

    // Fetch logo directly (works during build)
    const result = await fetchLogo(domain);

    if (result.buffer) {
      // Convert buffer to data URL for client
      const base64 = result.buffer.toString('base64');
      const mimeType = result.buffer[0] === 0x3c ? 'image/svg+xml' : 'image/png';
      const dataUrl = `data:${mimeType};base64,${base64}`;

      return <ThemeWrapper
        investment={props}
        logoData={{
          url: dataUrl,
          source: result.source
        }}
        renderedMetrics={metricsElement}
      />;
    }

    // Use placeholder for failed fetches
    const placeholder = await getPlaceholder();
    const base64 = placeholder.toString('base64');
    return <ThemeWrapper
      investment={props}
      logoData={{
        url: `data:image/svg+xml;base64,${base64}`,
        source: null
      }}
      renderedMetrics={metricsElement}
    />;
  } catch (error) {
    console.error('Error in InvestmentCard:', error);
    // Return placeholder on any error
    const placeholder = await getPlaceholder();
    const base64 = placeholder.toString('base64');
    return <ThemeWrapper
      investment={props}
      logoData={{
        url: `data:image/svg+xml;base64,${base64}`,
        source: null
      }}
      renderedMetrics={metricsElement}
    />;
  }
}
