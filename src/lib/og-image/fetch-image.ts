/**
 * OG Image Fetcher
 * @module lib/og-image/fetch-image
 * @description
 * Fetches external images and converts them to base64 PNG data URLs for Satori.
 * Satori only supports PNG, JPEG, and GIF — not WebP — so sharp converts all formats to PNG.
 *
 * Security hardening against SSRF:
 * - Timeout: Prevents slow-loris attacks (5s limit)
 * - Content-Type validation: Only accepts image/* responses
 * - Size cap: Prevents large file downloads (4 MiB streaming limit)
 * - Pixel cap: Prevents decompression bombs via sharp limitInputPixels
 * - Protocol restriction: Only http/https via ensureAbsoluteUrl
 * - Host validation: Blocks private/internal IPs via isPrivateHost
 *
 * Defense-in-depth notes:
 * - DNS-to-private bypass: The isPrivateHost check validates hostnames, not resolved IPs.
 *   A malicious domain resolving to internal IPs could bypass this check. This is mitigated
 *   by infrastructure-level egress rules (Vercel/Cloudflare network restrictions) that prevent
 *   serverless functions from reaching private IP ranges regardless of DNS resolution.
 */

import sharp from "sharp";

import {
  ensureAbsoluteUrl,
  FETCH_TIMEOUT_MS,
  MAX_IMAGE_SIZE_BYTES,
  MAX_INPUT_PIXELS,
} from "./security";

/**
 * Fetch an image URL and convert it to a base64 PNG data URL.
 * Returns null on any failure (network, validation, size, format).
 */
export async function fetchImageAsDataUrl(
  url: string,
  requestOrigin: string,
): Promise<string | null> {
  try {
    const absoluteUrl = ensureAbsoluteUrl(url, requestOrigin);
    const response = await fetch(absoluteUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; OG-Image-Bot/1.0)",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(`[OG-Image] Failed to fetch image: ${response.status}`);
      return null;
    }

    const contentType = response.headers.get("content-type");
    if (!contentType?.startsWith("image/")) {
      console.error(`[OG-Image] Invalid content-type: ${contentType}`);
      return null;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      console.error("[OG-Image] No response body reader available");
      return null;
    }

    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalSize += value.length;
      if (totalSize > MAX_IMAGE_SIZE_BYTES) {
        await reader.cancel();
        console.error(
          `[OG-Image] Image exceeds size limit: ${totalSize} > ${MAX_IMAGE_SIZE_BYTES}`,
        );
        return null;
      }
      chunks.push(value);
    }

    const buffer = Buffer.concat(chunks);
    const pngBuffer = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).png().toBuffer();
    const base64 = pngBuffer.toString("base64");
    return `data:image/png;base64,${base64}`;
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      console.error(`[OG-Image] Fetch aborted/timeout after ${FETCH_TIMEOUT_MS}ms`);
      return null;
    }
    console.error("[OG-Image] Error converting image:", error);
    return null;
  }
}
