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
import { getUnifiedImageService } from "@/lib/services/unified-image-service";
import { setLogoValidation } from "@/lib/data-access/logos";
import { type NextRequest, NextResponse } from "next/server";
import { isBlankOrPlaceholder } from "@/lib/image-handling/image-analysis";
import { generateImageSignature, compareSignatures } from "@/lib/image-handling/image-compare";
import { NO_STORE_HEADERS } from "@/lib/utils/api-utils";

/** Reference globe icon buffer - loaded once and reused */
let GLOBE_ICON_BUFFER: Buffer | null = null;

// Enable dynamic rendering to allow API calls during server-side rendering

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
            headers: NO_STORE_HEADERS,
          },
        );
      }

      buffer = result.buffer;
    } else {
      return NextResponse.json(
        { error: "No image provided" },
        {
          status: 400,
          headers: NO_STORE_HEADERS,
        },
      );
    }

    // Compute cheap hash *once* for caching decisions.
    const bufferHash = getBufferSha(buffer);

    // Basic buffer validation - check if it looks like an image
    const bufferStart = buffer.subarray(0, 16).toString("hex");
    const isLikelyImage =
      bufferStart.startsWith("89504e47") || // PNG
      bufferStart.startsWith("ffd8ff") || // JPEG
      bufferStart.startsWith("47494638") || // GIF
      bufferStart.startsWith("52494646"); // WebP/RIFF

    if (!isLikelyImage) {
      // Not a recognized image format
      setLogoValidation(bufferHash, false);

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

    // Use UnifiedImageService for validation with caching
    const imageService = getUnifiedImageService();
    const validation = await imageService.validateLogo(buffer);
    const isGlobeIcon = validation.isGlobeIcon;

    // Enhanced validation with pattern detection
    const blankCheck = await isBlankOrPlaceholder(buffer);

    if (blankCheck.isBlank || blankCheck.isGlobe) {
      // Update cache with detection result
      setLogoValidation(bufferHash, true);
      return NextResponse.json(
        {
          isGlobeIcon: true,
          reason: blankCheck.reason,
          confidence: blankCheck.confidence,
        },
        {
          headers: {
            "Cache-Control": "public, max-age=31536000", // 1 year
          },
        },
      );
    }

    // Also check similarity with reference globe icon if available
    if (!isGlobeIcon && GLOBE_ICON_BUFFER) {
      try {
        const [bufferSig, globeSig] = await Promise.all([
          generateImageSignature(buffer),
          generateImageSignature(GLOBE_ICON_BUFFER),
        ]);

        const similarity = compareSignatures(bufferSig, globeSig);

        // Consider it a globe icon if similarity > 0.7
        if (similarity > 0.7) {
          setLogoValidation(bufferHash, true);
          return NextResponse.json(
            {
              isGlobeIcon: true,
              reason: "similar_to_reference",
              similarity,
              confidence: similarity,
            },
            {
              headers: {
                "Cache-Control": "public, max-age=31536000", // 1 year
              },
            },
          );
        }
      } catch (err) {
        console.debug("Error comparing with reference icon:", err);
      }
    }

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
        headers: NO_STORE_HEADERS,
      },
    );
  }
}

/**
 * Fast SHA-256 hash of the raw buffer. Unlike `getImageHash` this does **not**
 * normalize or decode the image, so it is extremely cheap and
 * avoids allocating large intermediate buffers. We use it purely for cache
 * look-ups so that identical logo uploads/URLs skip the costly validation
 * pipeline on subsequent requests.
 */
function getBufferSha(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
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
