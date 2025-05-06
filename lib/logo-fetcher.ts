/**
 * Logo Fetching Utility
 * @module lib/logo-fetcher
 * @description
 * Direct logo fetching implementation that works during build time
 * and runtime. This module provides the core logo fetching logic
 * used by both API routes and server components.
 */

import { ServerCacheInstance } from './server-cache';
import { LOGO_SOURCES } from './constants';
import type { LogoSource } from '../types/logo';
import { assertServerOnly } from './utils/ensure-server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

assertServerOnly('lib/logo-fetcher.ts');

// --- Filesystem Helper Functions (adapted from app/api/logo/route.ts) ---

let fsLogosDir: string | null = null; // Cache the determined logos directory path
let fsCheckedLogosDir = false;

/** Generate a hash for the domain to use as filename */
function fsGetDomainHash(domain: string): string {
  return createHash('md5').update(domain).digest('hex');
}

/** Get the potential path for storing/reading a logo */
function fsGetLogoPath(domain: string, source: string): string | null {
  if (!fsLogosDir) {
    console.warn('[logo-fetcher] Logos directory not initialized.');
    return null; // Cannot determine path if directory is not set
  }
  const hash = fsGetDomainHash(domain);
  // Always use .png for consistency, even if fetched format differs initially
  return path.join(fsLogosDir, `${hash}-${source}.png`);
}

/** Try to read a logo from disk */
async function fsReadLogoFromDisk(logoPath: string | null): Promise<Buffer | null> {
  if (!logoPath) return null;
  try {
    return await fs.readFile(logoPath);
  } catch (error: any) {
    // If the error is ENOENT (file not found), it's expected, don't log heavily
    if (error.code !== 'ENOENT') {
      console.warn(`[logo-fetcher] Failed to read logo from disk (${logoPath}):`, error);
    }
    return null;
  }
}

/** Try to write a logo to disk */
async function fsWriteLogoToDisk(logoPath: string | null, buffer: Buffer): Promise<boolean> {
  if (!logoPath) return false;
  try {
    await fs.writeFile(logoPath, buffer);
    return true;
  } catch (error) {
    console.warn(`[logo-fetcher] Failed to write logo to disk (${logoPath}):`, error);
    return false;
  }
}

/** Ensure the logos directory exists and set the cached path */
async function fsEnsureLogosDirectory(): Promise<boolean> {
  if (fsCheckedLogosDir) return !!fsLogosDir; // Return cached status after first check

  const basePaths = [
    // Most likely path in production build relative to server.js in .next/standalone
    path.join(process.cwd(), 'public', 'logos'),
    // Development path
    path.join(process.cwd(), 'public', 'logos'),
    // Path relative to source if cwd is different
    path.join(__dirname, '..', '..', 'public', 'logos'),
     // Direct Docker container path fallback
    '/app/public/logos'
  ];

  let dirFound = false; // Track if a directory was found
  for (const logosDir of basePaths) {
    try {
      try {
        await fs.access(logosDir);
      } catch {
        await fs.mkdir(logosDir, { recursive: true });
      }
      const testFile = path.join(logosDir, '.write-test');
      await fs.writeFile(testFile, '');
      await fs.unlink(testFile);
      fsLogosDir = logosDir; // Cache the working directory path
      console.info(`[logo-fetcher] Using logos directory: ${fsLogosDir}`);
      dirFound = true; // Mark as found
      break; // Exit loop once a working directory is found
    } catch (error: any) {
      // Log only if it's not a simple "not found" error during access check
      if (error.code !== 'ENOENT' || !error.message.includes('access')) {
         console.warn(`[logo-fetcher] Logos directory check failed for ${logosDir}:`, error.code || error.message);
      }
    }
  }

  // Mark as checked only after trying all paths
  fsCheckedLogosDir = true;

  if (!dirFound) {
    console.warn('[logo-fetcher] No writable logos directory found. Filesystem cache disabled.');
  }

  return dirFound;
}

// Initialize directory check asynchronously (don't block initial load)
const filesystemReadyPromise = fsEnsureLogosDirectory();

// --- Constants ---
const IS_BUILD_PHASE = process.env.NEXT_PHASE === 'phase-production-build';
const FETCH_TIMEOUT_MS = IS_BUILD_PHASE ? 2000 : 5000; // Shorter timeout during build

/**
 * Fetch a logo for a given domain, prioritizing caches
 * @param {string} domain - Domain to fetch logo for
 * @returns {Promise<{buffer: Buffer | null, source: LogoSource | null, error?: string}>}
 */
export async function fetchLogo(domain: string): Promise<{
  buffer: Buffer | null;
  source: LogoSource | null;
  error?: string;
}> {
  if (!domain) {
    return { buffer: null, source: null, error: 'Domain is required' };
  }

  // 1. Check Memory Cache
  const memoryCached = ServerCacheInstance.getLogoFetch(domain);
  if (memoryCached) {
    if (memoryCached.error && !memoryCached.buffer) {
        // Return cached failure unless it's a build-time fetch failure (allow retry at runtime)
       if (memoryCached.error !== 'Fetch failed/timedout during build') {
          return { buffer: null, source: null, error: memoryCached.error };
       }
    } else if (memoryCached.buffer) {
       return { buffer: memoryCached.buffer, source: memoryCached.source };
    }
    // If it's a build-time error, proceed to check filesystem/fetch
  }


  // 2. Check Filesystem Cache (if directory is available)
  const hasFileSystem = await filesystemReadyPromise;
  if (hasFileSystem && fsLogosDir) { // Ensure directory path is set
    for (const source of ['google', 'clearbit', 'duckduckgo'] as const) {
      const logoPath = fsGetLogoPath(domain, source);
      const diskBuffer = await fsReadLogoFromDisk(logoPath);
      if (diskBuffer) {
        console.debug(`[logo-fetcher] Cache hit (Disk): ${domain} from ${source}`);
        // Update memory cache as well
        ServerCacheInstance.setLogoFetch(domain, { url: null, source, buffer: diskBuffer });
        return { buffer: diskBuffer, source };
      }
    }
  } else if (!hasFileSystem && !fsCheckedLogosDir) {
      // Log only once if filesystem check is still pending or failed initially
      console.debug("[logo-fetcher] Filesystem cache not available or check pending.");
  }


  // 3. Fetch from External Sources
  console.debug(`[logo-fetcher] Cache miss: ${domain}. Fetching externally...`);
  for (const source of ['google', 'clearbit', 'duckduckgo'] as const) {
    let buffer: Buffer | null = null;
    let fetchError: string | null = null;

    try {
      const url = LOGO_SOURCES[source].hd(domain); // Prioritize HD sources
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const fetchPromise = fetch(url, {
        signal: controller.signal,
        // Revalidate less often for external fetches than internal API calls
        next: { revalidate: IS_BUILD_PHASE ? 60 * 60 * 24 : 60 * 60 } // 24h during build, 1h runtime
      });

      let response;
      try {
        response = await fetchPromise;
      } finally {
        clearTimeout(timeoutId);
      }

      if (response.ok) {
        const fetchedBuffer = Buffer.from(await response.arrayBuffer());
        // Basic validation: Check if non-empty
        if (fetchedBuffer && fetchedBuffer.byteLength > 0) {
           // TODO: Add basic image validation (is it actually an image?) maybe using sharp?
           // For now, assume ok if non-empty
          buffer = fetchedBuffer;
        } else {
          fetchError = `Empty response from ${source}`;
        }
      } else {
        fetchError = `HTTP ${response.status} from ${source}`;
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        fetchError = `Timeout fetching from ${source} (${FETCH_TIMEOUT_MS}ms)`;
      } else {
        fetchError = `Error fetching from ${source}: ${error.message}`;
      }
      // Log network errors, especially during build if persistent
       if (IS_BUILD_PHASE || error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            console.warn(`[logo-fetcher] ${fetchError} for domain ${domain}`);
       } else {
           console.debug(`[logo-fetcher] ${fetchError} for domain ${domain}`); // Less verbose for runtime timeouts
       }
    }

    // If fetch was successful
    if (buffer) {
      console.debug(`[logo-fetcher] Fetch success: ${domain} from ${source}`);
      // Cache in memory
      ServerCacheInstance.setLogoFetch(domain, { url: null, source, buffer });
      // Attempt to cache on disk (fire and forget)
      if (hasFileSystem) {
         const logoPath = fsGetLogoPath(domain, source);
          fsWriteLogoToDisk(logoPath, buffer).catch(err => {
             console.warn(`[logo-fetcher] Background disk write failed for ${logoPath}:`, err);
          }); // Don't await, don't let it block
      }
      return { buffer, source };
    }
  }

  // 4. All sources failed
  const finalError = `Failed to fetch logo for ${domain} from all sources.`;
   // Only cache definitive failures at runtime. Build failures shouldn't prevent runtime fetches.
   if (!IS_BUILD_PHASE) {
     ServerCacheInstance.setLogoFetch(domain, { url: null, source: null, error: finalError });
   } else {
      // For build phase, return specific error but don't cache it persistently
      return { buffer: null, source: null, error: 'Fetch failed/timedout during build' };
   }


  return { buffer: null, source: null, error: finalError };
}

/**
 * Extract domain from URL or company name
 * @param {string} input - URL or company name
 * @returns {string} Normalized domain or company name
 */
export function normalizeDomain(input: string): string {
  try {
    // If it's a URL, extract the domain
    if (input.includes('://') || input.startsWith('www.')) {
      const url = input.startsWith('http') ? input : `https://${input}`;
      return new URL(url).hostname.replace('www.', '');
    }
    // Otherwise, treat as company name
    return input.toLowerCase().replace(/\s+/g, '');
  } catch {
    // If URL parsing fails, normalize as company name
    return input.toLowerCase().replace(/\s+/g, '');
  }
}
