/**
 * Logo Validation API Route
 * @module app/api/validate-logo
 * @description
 * Server-side API endpoint for validating logo images.
 * This route handles image validation and comparison to detect generic globe icons.
 */

import { createHash } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import fs from "node:fs/promises";
import path from "node:path";
import { type NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { MIN_LOGO_SIZE, VALID_IMAGE_FORMATS } from "@/lib/constants";
import { ServerCacheInstance } from "@/lib/server-cache";
import { getUnifiedImageService } from "@/lib/services/unified-image-service";

/** Reference globe icon buffer - loaded once and reused */
let referenceGlobeIcon: Buffer | null = null;

/**
 * Calculate perceptual hash of an image
 * @param {Buffer} buffer - Image buffer to hash
 * @returns {Promise<string>} Hash of the image
 */
async function getImageHash(buffer: Buffer): Promise<string> {
  try {
    const normalized = await sharp(buffer).resize(16, 16, { fit: "fill" }).grayscale().raw().toBuffer();

    return createHash("sha256").update(normalized).digest("hex");
  } catch (error) {
    console.error("Error generating image hash:", error);
    return "";
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
    let meta1: sharp.Metadata;
    let meta2: sharp.Metadata;
    try {
      const results = await Promise.all([sharp(image1).metadata(), sharp(image2).metadata()]);
      meta1 = results[0];
      meta2 = results[1];
    } catch (error) {
      console.error("Error getting image metadata:", error);
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
  if (referenceGlobeIcon) return;

  const possiblePaths = [
    path.join(process.cwd(), "public/images/reference-globe-icon.png"),
    path.join(process.cwd(), "/public/images/reference-globe-icon.png"),
    path.join(process.cwd(), "../public/images/reference-globe-icon.png"),
    "/app/public/images/reference-globe-icon.png", // Direct Docker container path
  ];

  for (const p of possiblePaths) {
    try {
      referenceGlobeIcon = await fs.readFile(p);
      console.info(`Successfully loaded reference globe icon from: ${p}`);
      return;
    } catch {
      // Try next path
    }
  }

  console.warn("Failed to load reference globe icon from any known path");
}

/**
 * POST handler for logo validation
 * @param {NextRequest} request - Incoming request
 * @returns {Promise<NextResponse>} API response
 */
// Enable dynamic rendering to allow API calls during server-side rendering
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  await loadReferenceIcon();

  if (!referenceGlobeIcon) {
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

    // Early content-type sniff using file-type to avoid costly Sharp parsing
    const detectedType = await fileTypeFromBuffer(buffer);
    if (!detectedType || !VALID_IMAGE_FORMATS.includes(detectedType.ext as (typeof VALID_IMAGE_FORMATS)[number])) {
      // Unsupported or unknown image format – short-circuit and remember so we
      // never process this identical buffer again.
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
    const isGlobeIcon = await compareImages(buffer, referenceGlobeIcon);

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
