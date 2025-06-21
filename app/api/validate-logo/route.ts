/**
 * Logo Validation API Route
 * @module app/api/validate-logo
 * @description
 * Server-side API endpoint for validating logo images.
 * Simplified version to avoid Bun CommonJS wrapper issues.
 */

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { ServerCacheInstance } from "@/lib/server-cache";
import { getUnifiedImageService } from "@/lib/services/unified-image-service";
import logger from "@/lib/utils/logger";
import { type NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

/** Reference globe icon buffer - loaded once and reused */
let GLOBE_ICON_BUFFER: Buffer | null = null;

const VALID_IMAGE_FORMATS = ["avif", "gif", "jpeg", "jpg", "png", "svg", "webp"] as const;
const MIN_LOGO_SIZE = 16;

// Enable dynamic rendering to allow API calls during server-side rendering
export const dynamic = "force-dynamic";

/**
 * POST handler for logo validation
 * @param {NextRequest} request - Incoming request
 * @returns {Promise<NextResponse>} API response
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  await loadReferenceIcon();

  if (!GLOBE_ICON_BUFFER) {
    return NextResponse.json(
      { isGlobeIcon: false },
      {
        headers: {
          "Cache-Control": "public, max-age=31536000", // 1 year
        },
      },
    );
  }

  try {
    const formData = await request.formData();
    const imageFile = formData.get("image") as File;
    const imageUrl = formData.get("url") as string;

    let buffer: Buffer;

    if (imageFile) {
      buffer = Buffer.from(await imageFile.arrayBuffer());
    } else if (imageUrl) {
      // Use UnifiedImageService to fetch the image
      const imageService = getUnifiedImageService();
      const result = await imageService.getImage(imageUrl);

      if (!result.buffer) {
        return NextResponse.json(
          { error: result.error || "Failed to fetch image" },
          {
            status: 500,
            headers: {
              "Cache-Control": "no-store",
            },
          },
        );
      }

      buffer = result.buffer;
    } else {
      return NextResponse.json(
        { error: "No image provided" },
        {
          status: 400,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    // Compute cheap hash *once* for caching decisions.
    const bufferHash = getBufferSha(buffer);

    // Basic buffer validation - check if it looks like an image
    const bufferStart = buffer.subarray(0, 16).toString('hex');
    const isLikelyImage = 
      bufferStart.startsWith('89504e47') || // PNG
      bufferStart.startsWith('ffd8ff') || // JPEG
      bufferStart.startsWith('47494638') || // GIF
      bufferStart.startsWith('52494646'); // WebP/RIFF
    
    if (!isLikelyImage) {
      // Not a recognized image format
      ServerCacheInstance.setLogoValidation(bufferHash, false);

      return NextResponse.json(
        { isGlobeIcon: false },
        {
          headers: {
            "Cache-Control": "public, max-age=31536000", // 1 year
          },
        },
      );
    }

    // Reject extremely large buffers early – generic globe icons are tiny,
    // so anything > 512 KB is certainly *not* a stock placeholder. Skipping
    // protects us from loading multi-megabyte images into Sharp.
    if (buffer.byteLength > 512 * 1024) {
      return NextResponse.json(
        { isGlobeIcon: false },
        {
          headers: {
            "Cache-Control": "public, max-age=31536000",
          },
        },
      );
    }

    // Cheap cache look-up using raw buffer hash. If we have already processed
    // this **exact** image, skip the expensive Sharp work entirely.
    const cached = ServerCacheInstance.getLogoValidation(bufferHash);
    if (cached) {
      return NextResponse.json(
        { isGlobeIcon: cached.isGlobeIcon },
        {
          headers: {
            "Cache-Control": "public, max-age=31536000", // 1 year
          },
        },
      );
    }

    // Compare with reference icon (expensive path – only if not cached)
    const isGlobeIcon = await compareImages(buffer, GLOBE_ICON_BUFFER);

    // Store result against raw buffer hash so future identical images bypass
    // Sharp processing.
    ServerCacheInstance.setLogoValidation(bufferHash, isGlobeIcon);

    return NextResponse.json(
      { isGlobeIcon },
      {
        headers: {
          "Cache-Control": "public, max-age=31536000", // 1 year
        },
      },
    );
  } catch (error) {
    console.debug("Error validating logo:", error);
    return NextResponse.json(
      { error: "Failed to validate logo" },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}

/**
 * Fast SHA-256 hash of the raw buffer. Unlike `getImageHash` this does **not**
 * normalise or decode the image with Sharp, so it is extremely cheap and
 * avoids allocating large intermediate buffers. We use it purely for cache
 * look-ups so that identical logo uploads/URLs skip the costly validation
 * pipeline on subsequent requests.
 */
function getBufferSha(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Compare two images for similarity
 * @param {Buffer} image1 - First image buffer
 * @param {Buffer} image2 - Second image buffer
 * @returns {Promise<boolean>} True if images are similar
 */
async function compareImages(image1: Buffer, image2: Buffer): Promise<boolean> {
  try {
    // Validate image formats first
    let meta1: sharp.Metadata | undefined;
    let meta2: sharp.Metadata | undefined;
    try {
      [meta1, meta2] = await Promise.all([sharp(image1).metadata(), sharp(image2).metadata()]);
    } catch (e) {
      logger.warn(`[ValidateLogoAPI] Invalid image format: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }

    if (!meta1 || !meta2) {
      console.debug("Failed to get image metadata");
      return false;
    }

    // Basic format validation
    const format1 = meta1.format;
    const format2 = meta2.format;

    const isFormat1Valid = format1 ? VALID_IMAGE_FORMATS.some((vf) => vf === format1) : false;
    const isFormat2Valid = format2 ? VALID_IMAGE_FORMATS.some((vf) => vf === format2) : false;

    if (!format1 || !format2 || !isFormat1Valid || !isFormat2Valid) {
      console.debug("Invalid image format detected or format not in VALID_IMAGE_FORMATS");
      return false;
    }

    // Basic size validation
    // Ensure width and height are numbers before comparing
    const w1 = typeof meta1.width === "number" ? meta1.width : 0;
    const h1 = typeof meta1.height === "number" ? meta1.height : 0;
    const w2 = typeof meta2.width === "number" ? meta2.width : 0;
    const h2 = typeof meta2.height === "number" ? meta2.height : 0;

    if (
      !w1 ||
      !w2 ||
      !h1 ||
      !h2 ||
      w1 < MIN_LOGO_SIZE ||
      h1 < MIN_LOGO_SIZE ||
      w2 < MIN_LOGO_SIZE ||
      h2 < MIN_LOGO_SIZE
    ) {
      console.debug("Invalid image dimensions");
      return false;
    }

    // Directly calculate perceptual hashes without an intermediate PNG
    // conversion.  Sharp will decode the original buffers, resize to a small
    // 16×16 grayscale bitmap, and we hash that – this avoids allocating large
    // temporary buffers and significantly reduces RAM churn.
    const [hash1, hash2] = await Promise.all([getImageHash(image1), getImageHash(image2)]);

    if (!hash1 || !hash2) {
      return false;
    }

    return hash1 === hash2;
  } catch (error) {
    console.error("Error comparing images:", error);
    return false;
  }
}

/**
 * Load reference globe icon
 * @returns {Promise<void>}
 */
async function loadReferenceIcon(): Promise<void> {
  if (GLOBE_ICON_BUFFER) return;

  const possiblePaths = [
    path.join(process.cwd(), "public/images/reference-globe-icon.png"),
    path.join(process.cwd(), "/public/images/reference-globe-icon.png"),
    path.join(process.cwd(), "../public/images/reference-globe-icon.png"),
    "/app/public/images/reference-globe-icon.png", // Direct Docker container path
  ];

  for (const p of possiblePaths) {
    try {
      GLOBE_ICON_BUFFER = await fs.readFile(p);
      console.info(`Successfully loaded reference globe icon from: ${p}`);
      return;
    } catch {
      // Try next path
    }
  }

  console.warn("Failed to load reference globe icon from any known path");
}

/**
 * Generate perceptual hash for image comparison
 * @param buffer - Image buffer
 * @returns Promise resolving to hash string
 */
async function getImageHash(buffer: Buffer): Promise<string> {
  try {
    // Create a small normalized representation of the image for comparison
    const normalized = await sharp(buffer)
      .resize(16, 16, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer();
    
    return createHash("sha256").update(normalized).digest("hex");
  } catch (error) {
    console.warn("Failed to generate image hash:", error);
    return "";
  }
}
