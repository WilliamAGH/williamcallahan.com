/**
 * Edge-compatible image size detection utility
 *
 * Replaces probe-image-size with a solution that works in both Node.js and Edge runtime.
 * Uses native fetch API for URLs and pure JavaScript parsing for buffers.
 */

// Import ProbeResult type from declaration file
import type { ProbeResult } from "@/types/probe-image-size";

/**
 * Probe image size from URL or Buffer
 * Edge-compatible replacement for probe-image-size
 */
export async function probeImageSize(input: string | Buffer): Promise<ProbeResult> {
  // For URLs, use fetch with range requests
  if (typeof input === "string" && (input.startsWith("http://") || input.startsWith("https://"))) {
    try {
      // Try to get just the header bytes first (more efficient)
      const response = await fetch(input, {
        headers: {
          Range: "bytes=0-65535", // Get first 64KB for image headers
        },
      });

      const buffer = Buffer.from(await response.arrayBuffer());

      // If we got a partial response or the full image is small, parse it
      if (response.status === 206 || buffer.length < 65536) {
        return parseImageHeader(buffer);
      }

      // Otherwise, try without range (some servers don't support it)
      const fullResponse = await fetch(input);
      const fullBuffer = Buffer.from(await fullResponse.arrayBuffer());
      return parseImageHeader(fullBuffer);
    } catch (error) {
      throw new Error(`Failed to fetch image from URL: ${error instanceof Error ? error.message : String(error)}`, {
        cause: error,
      });
    }
  }

  // For buffers, parse directly
  if (Buffer.isBuffer(input)) {
    return parseImageHeader(input);
  }

  throw new Error("Input must be a URL string or Buffer");
}

/**
 * Parse image header to extract dimensions
 * Supports JPEG, PNG, GIF, WebP, and SVG
 */
function parseImageHeader(buffer: Buffer): ProbeResult {
  // Check for PNG
  if (buffer.length >= 24 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
      type: "png",
      mime: "image/png",
    };
  }

  // Check for JPEG
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    return parseJPEG(buffer);
  }

  // Check for GIF
  if (buffer.length >= 10 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return {
      width: buffer.readUInt16LE(6),
      height: buffer.readUInt16LE(8),
      type: "gif",
      mime: "image/gif",
    };
  }

  // Check for WebP
  if (
    buffer.length >= 30 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return parseWebP(buffer);
  }

  // Check for SVG (text-based)
  const header = buffer.slice(0, Math.min(1024, buffer.length)).toString("utf8");
  if (header.includes("<svg") || header.includes("<?xml")) {
    return parseSVG(header);
  }

  throw new Error("Unsupported image format");
}

/**
 * Parse JPEG header for dimensions
 */
function parseJPEG(buffer: Buffer): ProbeResult {
  let offset = 2; // Skip SOI marker

  while (offset < buffer.length) {
    // Check for valid marker
    if (buffer[offset] !== 0xff) {
      throw new Error("Invalid JPEG marker");
    }

    const marker = buffer[offset + 1];
    if (marker === undefined) {
      throw new Error("Invalid JPEG marker");
    }
    offset += 2;

    // Skip padding
    if (marker === 0xff) {
      offset -= 1;
      continue;
    }

    // SOF markers (Start of Frame)
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      // Skip length (2) and precision (1)
      offset += 3;
      const height = buffer.readUInt16BE(offset);
      const width = buffer.readUInt16BE(offset + 2);
      return {
        width,
        height,
        type: "jpg",
        mime: "image/jpeg",
      };
    }

    // Skip other segments
    if (marker !== 0xd8 && marker !== 0xd9) {
      const length = buffer.readUInt16BE(offset);
      offset += length;
    }
  }

  throw new Error("Could not find JPEG dimensions");
}

/**
 * Parse WebP header for dimensions
 */
function parseWebP(buffer: Buffer): ProbeResult {
  // Skip RIFF header (12 bytes)
  let offset = 12;

  while (offset < buffer.length - 8) {
    const chunkType = buffer.slice(offset, offset + 4).toString("ascii");
    const chunkSize = buffer.readUInt32LE(offset + 4);
    offset += 8;

    if (chunkType === "VP8 ") {
      // Lossy WebP
      if (buffer[offset + 3] === 0x9d && buffer[offset + 4] === 0x01 && buffer[offset + 5] === 0x2a) {
        const width = buffer.readUInt16LE(offset + 6) & 0x3fff;
        const height = buffer.readUInt16LE(offset + 8) & 0x3fff;
        return {
          width: width + 1,
          height: height + 1,
          type: "webp",
          mime: "image/webp",
        };
      }
    } else if (chunkType === "VP8L") {
      // Lossless WebP
      const bits = buffer.readUInt32LE(offset + 1);
      const width = (bits & 0x3fff) + 1;
      const height = ((bits >> 14) & 0x3fff) + 1;
      return {
        width,
        height,
        type: "webp",
        mime: "image/webp",
      };
    } else if (chunkType === "VP8X") {
      // Extended WebP
      const width = (buffer.readUInt32LE(offset + 4) & 0xffffff) + 1;
      const height = (buffer.readUInt32LE(offset + 7) & 0xffffff) + 1;
      return {
        width,
        height,
        type: "webp",
        mime: "image/webp",
      };
    }

    offset += chunkSize;
    // Align to even offset
    if (chunkSize % 2 === 1) offset++;
  }

  throw new Error("Could not find WebP dimensions");
}

/**
 * Parse SVG for dimensions
 */
function parseSVG(content: string): ProbeResult {
  let width = 0;
  let height = 0;
  let wUnits = "px";
  let hUnits = "px";

  // Try to find width and height attributes
  const widthMatch = content.match(/width\s*=\s*["']([^"']+)["']/i);
  const heightMatch = content.match(/height\s*=\s*["']([^"']+)["']/i);

  if (widthMatch?.[1]) {
    const parsed = parseUnit(widthMatch[1]);
    width = parsed.value;
    wUnits = parsed.unit;
  }

  if (heightMatch?.[1]) {
    const parsed = parseUnit(heightMatch[1]);
    height = parsed.value;
    hUnits = parsed.unit;
  }

  // If no width/height, try viewBox
  if ((!width || !height) && content.includes("viewBox")) {
    const viewBoxMatch = content.match(/viewBox\s*=\s*["']([^"']+)["']/i);
    if (viewBoxMatch?.[1]) {
      const parts = viewBoxMatch[1].split(/\s+/);
      if (parts.length === 4) {
        width = width || parseFloat(parts[2] || "0");
        height = height || parseFloat(parts[3] || "0");
      }
    }
  }

  return {
    width: width || 300, // Default SVG width
    height: height || 150, // Default SVG height
    type: "svg",
    mime: "image/svg+xml",
    wUnits,
    hUnits,
  };
}

/**
 * Parse unit from dimension string
 */
function parseUnit(value: string): { value: number; unit: string } {
  const match = value.match(/^(\d+(?:\.\d+)?)\s*(\w*)$/);
  if (match?.[1]) {
    return {
      value: parseFloat(match[1]),
      unit: match[2] || "px",
    };
  }
  return {
    value: parseFloat(value) || 0,
    unit: "px",
  };
}

/**
 * Backwards compatibility default export
 */
export default probeImageSize;
