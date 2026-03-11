/**
 * Edge-compatible image size detection utility
 *
 * Replaces probe-image-size with a solution that works in both Node.js and Edge runtime.
 * Uses native fetch API for URLs and pure JavaScript parsing for buffers.
 */

// Import ProbeResult type from declaration file
import type { ProbeResult } from "@/types/probe-image-size";

/** Image format magic bytes */
const HTTP_PARTIAL_CONTENT = 206;
const RANGE_REQUEST_SIZE = 65536;

/** PNG signature bytes */
const PNG_MIN_HEADER_SIZE = 24;
const PNG_SIG_0 = 0x89;
const PNG_SIG_1 = 0x50;
const PNG_SIG_2 = 0x4e;
const PNG_SIG_3 = 0x47;

/** JPEG signature bytes */
const JPEG_MIN_HEADER_SIZE = 2;
const JPEG_SOI_0 = 0xff;
const JPEG_SOI_1 = 0xd8;
const JPEG_MARKER_PREFIX = 0xff;
const JPEG_SOF0_START = 0xc0;
const JPEG_SOF0_END = 0xc3;
const JPEG_SOF1_START = 0xc5;
const JPEG_SOF1_END = 0xc7;
const JPEG_SOF2_START = 0xc9;
const JPEG_SOF2_END = 0xcb;
const JPEG_SOF3_START = 0xcd;
const JPEG_SOF3_END = 0xcf;
const JPEG_SOI_MARKER = 0xd8;
const JPEG_EOI_MARKER = 0xd9;

/** GIF signature bytes */
const GIF_MIN_HEADER_SIZE = 10;
const GIF_SIG_0 = 0x47;
const GIF_SIG_1 = 0x49;
const GIF_SIG_2 = 0x46;

/** WebP signature bytes */
const WEBP_MIN_HEADER_SIZE = 30;
const WEBP_RIFF_R = 0x52;
const WEBP_RIFF_I = 0x49;
const WEBP_RIFF_F = 0x46;
const WEBP_W = 0x57;
const WEBP_E = 0x45;
const WEBP_B = 0x42;
const WEBP_P = 0x50;
const VP8_LOSSY_SIG_0 = 0x9d;
const VP8_LOSSY_SIG_1 = 0x01;
const VP8_LOSSY_SIG_2 = 0x2a;

/** SVG viewBox part count */
const SVG_VIEWBOX_PARTS = 4;
const SVG_VIEWBOX_WIDTH_INDEX = 2;
const SVG_VIEWBOX_HEIGHT_INDEX = 3;
const REGEX_UNIT_GROUP = 2;

/** Buffer offset indices for image format parsing */
const BYTE_OFFSET_2 = 2;
const BYTE_OFFSET_3 = 3;
const GIF_WIDTH_OFFSET = 6;
const GIF_HEIGHT_OFFSET = 8;
const WEBP_W_OFFSET = 8;
const WEBP_E_OFFSET = 9;
const WEBP_B_OFFSET = 10;
const WEBP_P_OFFSET = 11;
const PNG_WIDTH_OFFSET = 16;
const PNG_HEIGHT_OFFSET = 20;

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
      if (response.status === HTTP_PARTIAL_CONTENT || buffer.length < RANGE_REQUEST_SIZE) {
        return parseImageHeader(buffer);
      }

      // Otherwise, try without range (some servers don't support it)
      const fullResponse = await fetch(input);
      const fullBuffer = Buffer.from(await fullResponse.arrayBuffer());
      return parseImageHeader(fullBuffer);
    } catch (error) {
      throw new Error(
        `Failed to fetch image from URL: ${error instanceof Error ? error.message : String(error)}`,
        {
          cause: error,
        },
      );
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
  if (
    buffer.length >= PNG_MIN_HEADER_SIZE &&
    buffer[0] === PNG_SIG_0 &&
    buffer[1] === PNG_SIG_1 &&
    buffer[BYTE_OFFSET_2] === PNG_SIG_2 &&
    buffer[BYTE_OFFSET_3] === PNG_SIG_3
  ) {
    return {
      width: buffer.readUInt32BE(PNG_WIDTH_OFFSET),
      height: buffer.readUInt32BE(PNG_HEIGHT_OFFSET),
      type: "png",
      mime: "image/png",
    };
  }

  // Check for JPEG
  if (
    buffer.length >= JPEG_MIN_HEADER_SIZE &&
    buffer[0] === JPEG_SOI_0 &&
    buffer[1] === JPEG_SOI_1
  ) {
    return parseJPEG(buffer);
  }

  // Check for GIF
  if (
    buffer.length >= GIF_MIN_HEADER_SIZE &&
    buffer[0] === GIF_SIG_0 &&
    buffer[1] === GIF_SIG_1 &&
    buffer[BYTE_OFFSET_2] === GIF_SIG_2
  ) {
    return {
      width: buffer.readUInt16LE(GIF_WIDTH_OFFSET),
      height: buffer.readUInt16LE(GIF_HEIGHT_OFFSET),
      type: "gif",
      mime: "image/gif",
    };
  }

  // Check for WebP
  if (
    buffer.length >= WEBP_MIN_HEADER_SIZE &&
    buffer[0] === WEBP_RIFF_R &&
    buffer[1] === WEBP_RIFF_I &&
    buffer[BYTE_OFFSET_2] === WEBP_RIFF_F &&
    buffer[BYTE_OFFSET_3] === WEBP_RIFF_F &&
    buffer[WEBP_W_OFFSET] === WEBP_W &&
    buffer[WEBP_E_OFFSET] === WEBP_E &&
    buffer[WEBP_B_OFFSET] === WEBP_B &&
    buffer[WEBP_P_OFFSET] === WEBP_P
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
    if (buffer[offset] !== JPEG_MARKER_PREFIX) {
      throw new Error("Invalid JPEG marker");
    }

    const marker = buffer[offset + 1];
    if (marker === undefined) {
      throw new Error("Invalid JPEG marker");
    }
    offset += 2;

    // Skip padding
    if (marker === JPEG_MARKER_PREFIX) {
      offset -= 1;
      continue;
    }

    // SOF markers (Start of Frame)
    if (
      (marker >= JPEG_SOF0_START && marker <= JPEG_SOF0_END) ||
      (marker >= JPEG_SOF1_START && marker <= JPEG_SOF1_END) ||
      (marker >= JPEG_SOF2_START && marker <= JPEG_SOF2_END) ||
      (marker >= JPEG_SOF3_START && marker <= JPEG_SOF3_END)
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
    if (marker !== JPEG_SOI_MARKER && marker !== JPEG_EOI_MARKER) {
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
      if (
        buffer[offset + 3] === VP8_LOSSY_SIG_0 &&
        buffer[offset + 4] === VP8_LOSSY_SIG_1 &&
        buffer[offset + 5] === VP8_LOSSY_SIG_2
      ) {
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
      if (parts.length === SVG_VIEWBOX_PARTS) {
        width = width || parseFloat(parts[SVG_VIEWBOX_WIDTH_INDEX] || "0");
        height = height || parseFloat(parts[SVG_VIEWBOX_HEIGHT_INDEX] || "0");
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
      unit: match[REGEX_UNIT_GROUP] || "px",
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
