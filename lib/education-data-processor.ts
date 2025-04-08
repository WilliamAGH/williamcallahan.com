/**
 * Server-only utilities for processing Education and Certification data,
 * specifically handling logo fetching and placeholder generation.
 */
import "server-only"; // Ensure this module is never bundled for the client

import type { Education, Certification, Class } from '../types/education';
import { fetchLogo, normalizeDomain } from './logo-fetcher';
import { assertServerOnly } from './utils/ensure-server-only'; // Import the assertion utility
import fs from 'fs/promises';
import path from 'path';

// Define the structure for logo data
export interface LogoData {
  url: string;
  source: string | null;
}

// Cache for placeholder SVG data URL
let placeholderSvgDataUrl: string | null = null;

/**
 * Gets the placeholder SVG content as a base64 data URL.
 * Reads from the filesystem and caches the result.
 * @returns {Promise<string>} Placeholder SVG data URL.
 */
async function getPlaceholderSvgDataUrl(): Promise<string> {
  assertServerOnly("getPlaceholderSvgDataUrl"); // Assert server context
  if (!placeholderSvgDataUrl) {
    try {
      const buffer = await fs.readFile(path.join(process.cwd(), 'public/images/company-placeholder.svg'));
      const base64 = buffer.toString('base64');
      placeholderSvgDataUrl = `data:image/svg+xml;base64,${base64}`;
    } catch (error) {
      console.error("Failed to read placeholder SVG:", error);
      // Fallback to a minimal inline SVG to avoid complete failure
      placeholderSvgDataUrl = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E";
    }
  }
  return placeholderSvgDataUrl;
}

/**
 * Processes a single education item to add logo data.
 * @param {Education} item - The raw education item.
 * @returns {Promise<Education & { logoData: LogoData }>} The item with added logoData.
 */
export async function processEducationItem<T extends Education>(item: T): Promise<T & { logoData: LogoData }> {
  assertServerOnly("processEducationItem"); // Assert server context
  const { website, institution, logo } = item;
  let logoData: LogoData;

  try {
    if (logo) {
      logoData = { url: logo, source: null };
    } else {
      const domain = website ? normalizeDomain(website) : normalizeDomain(institution);
      const result = await fetchLogo(domain);

      if (result.buffer) {
        const base64 = result.buffer.toString('base64');
        const mimeType = result.buffer.subarray(0, 4).toString() === '<svg' ? 'image/svg+xml' : 'image/png';
        logoData = { url: `data:${mimeType};base64,${base64}`, source: result.source };
      } else {
        logoData = { url: await getPlaceholderSvgDataUrl(), source: 'placeholder' };
      }
    }
  } catch (error) {
    console.error(`Error processing logo for education item "${institution}":`, error);
    logoData = { url: await getPlaceholderSvgDataUrl(), source: 'placeholder-error' };
  }

  return { ...item, logoData };
}

/**
 * Processes a single certification or class item to add logo data.
 * @param {Certification | Class} item - The raw certification or class item.
 * @returns {Promise<(Certification | Class) & { logoData: LogoData }>} The item with added logoData.
 */
export async function processCertificationItem<T extends Certification | Class>(item: T): Promise<T & { logoData: LogoData }> {
  assertServerOnly("processCertificationItem"); // Assert server context
  const { website, name, logo } = item;
  let logoData: LogoData;

  try {
    if (logo) {
      logoData = { url: logo, source: null };
    } else {
      const domain = website ? normalizeDomain(website) : normalizeDomain(name);
      const result = await fetchLogo(domain);

      if (result.buffer) {
        const base64 = result.buffer.toString('base64');
        // Simple check for SVG based on first few characters
        const mimeType = result.buffer.subarray(0, 4).toString() === '<svg' ? 'image/svg+xml' : 'image/png';
        logoData = { url: `data:${mimeType};base64,${base64}`, source: result.source };
      } else {
        logoData = { url: await getPlaceholderSvgDataUrl(), source: 'placeholder' };
      }
    }
  } catch (error) {
    console.error(`Error processing logo for certification item "${name}":`, error);
    logoData = { url: await getPlaceholderSvgDataUrl(), source: 'placeholder-error' };
  }

  return { ...item, logoData };
}