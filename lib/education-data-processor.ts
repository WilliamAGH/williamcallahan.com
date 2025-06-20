/**
 * Server-only utilities for processing Education and Certification data,
 * specifically handling logo fetching and placeholder generation.
 */
import "server-only"; // Ensure this module is never bundled for the client

import fs from "node:fs/promises";
import path from "node:path";
import { fetchLogo, normalizeDomain } from "@/lib/logo.server";
import type { Certification, Class, Education, EducationLogoData } from "../types/education";
import { assertServerOnly } from "./utils/ensure-server-only"; // Import the assertion utility

// Cache for placeholder SVG data URL
let placeholderSvgDataUrl: string | null = null;

/**
 * Gets the placeholder SVG content as a base64 data URL.
 * Reads from the filesystem and caches the result.
 * @returns {Promise<string>} Placeholder SVG data URL.
 */
async function getPlaceholderSvgDataUrl(): Promise<string> {
  assertServerOnly(); // Assert server context
  if (!placeholderSvgDataUrl) {
    try {
      // Try multiple possible paths for Docker environment compatibility
      const possiblePaths = [
        path.join(process.cwd(), "public/images/company-placeholder.svg"),
        path.join(process.cwd(), "/public/images/company-placeholder.svg"),
        path.join(process.cwd(), "../public/images/company-placeholder.svg"),
        "/app/public/images/company-placeholder.svg", // Direct Docker container path
      ];

      let buffer: Buffer | null = null;
      let loadedPath = "";

      // Try each path until we find one that works
      for (const p of possiblePaths) {
        try {
          buffer = await fs.readFile(p);
          loadedPath = p;
          break;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (_err) {
          // Continue to next path
        }
      }

      if (buffer) {
        console.info(`Successfully loaded placeholder SVG from: ${loadedPath}`);
        const base64 = buffer.toString("base64");
        placeholderSvgDataUrl = `data:image/svg+xml;base64,${base64}`;
      } else {
        throw new Error("Could not read placeholder SVG from any known path");
      }
    } catch (error) {
      console.error("Failed to read placeholder SVG:", error);
      // Fallback to a minimal inline SVG to avoid complete failure
      placeholderSvgDataUrl =
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23f0f0f0'/%3E%3Cpath d='M50,30 L70,50 L50,70 L30,50 Z' fill='%23aaa'/%3E%3C/svg%3E";
    }
  }
  return placeholderSvgDataUrl;
}

/**
 * Processes a single education item to add logo data.
 * @param {Education} item - The raw education item.
 * @returns {Promise<Education & { logoData: EducationLogoData }>} The item with added logoData.
 */
export async function processEducationItem<T extends Education>(item: T): Promise<T & { logoData: EducationLogoData }> {
  assertServerOnly(); // Assert server context
  const { website, institution, logo } = item;
  let logoData: EducationLogoData;

  try {
    if (logo) {
      // If a specific logo URL is provided, treat it as definitive
      logoData = { url: logo, source: null };
    } else {
      // Otherwise, fetch by domain
      const domain = website ? normalizeDomain(website) : normalizeDomain(institution);
      const result = await fetchLogo(domain);

      if (result.buffer) {
        const base64 = result.buffer.toString("base64");
        // Simple check for SVG based on first few characters
        const mimeType = result.buffer.subarray(0, 4).toString() === "<svg" ? "image/svg+xml" : "image/png";
        logoData = { url: `data:${mimeType};base64,${base64}`, source: result.source };
      } else {
        logoData = { url: await getPlaceholderSvgDataUrl(), source: "placeholder" };
      }
    }
  } catch (error) {
    console.error(`Error processing logo for education item "${institution}":`, error);
    logoData = { url: await getPlaceholderSvgDataUrl(), source: "placeholder-error" };
  }

  return { ...item, logoData };
}

/**
 * Processes a single certification or class item to add logo data.
 * @param {Certification | Class} item - The raw certification or class item.
 * @returns {Promise<(Certification | Class) & { logoData: EducationLogoData }>} The item with added logoData.
 */
export async function processCertificationItem<T extends Certification | Class>(
  item: T,
): Promise<T & { logoData: EducationLogoData }> {
  assertServerOnly(); // Assert server context
  const { website, name, logo } = item;
  let logoData: EducationLogoData;

  try {
    if (logo) {
      logoData = { url: logo, source: null };
    } else {
      const domain = website ? normalizeDomain(website) : normalizeDomain(name);
      const result = await fetchLogo(domain);

      if (result.buffer) {
        const base64 = result.buffer.toString("base64");
        // Simple check for SVG based on first few characters
        const mimeType = result.buffer.subarray(0, 4).toString() === "<svg" ? "image/svg+xml" : "image/png";
        logoData = { url: `data:${mimeType};base64,${base64}`, source: result.source };
      } else {
        logoData = { url: await getPlaceholderSvgDataUrl(), source: "placeholder" };
      }
    }
  } catch (error) {
    console.error(`Error processing logo for certification item "${name}":`, error);
    logoData = { url: await getPlaceholderSvgDataUrl(), source: "placeholder-error" };
  }

  return { ...item, logoData };
}
