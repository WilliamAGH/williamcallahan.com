/**
 * Extracts lightweight metadata (format, dimensions, animation flag) from an
 * image buffer **without** relying on heavyweight native libraries such as
 * `sharp`. It uses our Edge-compatible probe implementation, which parses
 * headers only and therefore runs in constant memory.
 *
 * NOTE: Alpha-channel detection is not supported; callers may refine the
 * `hasAlpha` flag if that information is required.
 *
 * TODO(wasm-image): When we introduce a WASM image pipeline, extend this
 * function to detect transparency, ICC profiles and EXIF orientation.
 */

import type { ProbeResult } from "@/types/probe-image-size";
import { probeImageSize } from "./edge-compatible-probe";
import type { BasicImageMeta } from "@/types/image";

// Cache of hashes we have already complained about so we don't spam logs
const loggedUnsupportedImages = new Set<string>();

export async function extractBasicImageMeta(buffer: Buffer): Promise<BasicImageMeta> {
  try {
    const result: ProbeResult = await probeImageSize(buffer);

    if (result) {
      const format: string = result.type;
      const width: number = result.width;
      const height: number = result.height;

      return {
        format,
        width,
        height,
        // Note: Our Edge-compatible probe doesn't support pages detection yet
        // This could be enhanced to support animated GIF/WebP detection
        animated: false,
        hasAlpha: false,
      };
    }
  } catch (error) {
    // For troubleshooting we want a single concise line that includes format hint
    // but we do NOT want to spam every occurrence. Use first 4-byte magic + size
    try {
      const magic = buffer.slice(0, 4).toString("hex");
      const sig = `${magic}-${buffer.length}`;
      if (!loggedUnsupportedImages.has(sig)) {
        loggedUnsupportedImages.add(sig);
        console.warn(
          `[ImageMeta] Unsupported/unknown format (magic=${magic}, bytes=${buffer.length}):`,
          (error as Error).message ?? error,
        );
      }
    } catch {
      // Fallback generic log
      console.warn("[ImageMeta] Failed to extract image metadata", error);
    }
  }

  // Fallback when probe fails (e.g., very small buffers, unsupported format)
  return {
    format: undefined,
    width: undefined,
    height: undefined,
    animated: false,
    hasAlpha: false,
  };
}
