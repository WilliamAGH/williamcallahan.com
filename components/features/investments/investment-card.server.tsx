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
import fs from 'node:fs/promises';
import path from 'node:path';
import FinancialMetrics from '../../ui/financial-metrics.server';

import type { JSX } from "react";

// Cache for placeholder SVG
let placeholderSvg: Buffer | null = null;

/**
 * Check if an investment is defunct or closed
 * @param {Investment} investment - Investment to check
 * @returns {boolean} True if investment is defunct/closed
 */
function isInvestmentDefunct(investment: Investment): boolean {
  const { status, operating_status: operatingStatus, shutdown_year: shutdownYear, acquired_year: acquiredYear } = investment;
  
  // Check various indicators of defunct/closed status
  return (
    status === 'Realized' ||
    operatingStatus === 'Shut Down' ||
    operatingStatus === 'Inactive' ||
    shutdownYear !== null ||
    acquiredYear !== null
  );
}

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
  const { website, name, logo, holding_return: holdingReturn } = props;

  // Render FinancialMetrics server-side
  const metricsElement = <FinancialMetrics holding_return={holdingReturn} />;

  try {
    // If logo is provided directly, use it
    if (logo) {
      return <ThemeWrapper investment={props} logoData={{ url: logo, source: null }} renderedMetrics={metricsElement} />;
    }

    // Skip logo fetching if no website is provided - obvious optimization
    if (!website) {
      console.log(`[InvestmentCard] No website provided for ${name}, using placeholder`);
      const placeholder = await getPlaceholder();
      const placeholderDataUrl = `data:image/svg+xml;base64,${placeholder.toString('base64')}`;
      return <ThemeWrapper investment={props} logoData={{ url: placeholderDataUrl, source: null }} renderedMetrics={metricsElement} />;
    }

    // Skip logo fetching for defunct/closed investments to avoid unnecessary API calls
    if (isInvestmentDefunct(props)) {
      console.log(`[InvestmentCard] Skipping logo fetch for defunct investment: ${name}`);
      const placeholder = await getPlaceholder();
      const placeholderDataUrl = `data:image/svg+xml;base64,${placeholder.toString('base64')}`;
      return <ThemeWrapper investment={props} logoData={{ url: placeholderDataUrl, source: null }} renderedMetrics={metricsElement} />;
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
