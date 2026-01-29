import { processImageBufferSimple } from "./shared-image-processing";
import type { ProcessedImageResult } from "@/types/image";

/**
 * Invert logo buffer preserving original format.
 * Returns the inverted buffer and original content-type.
 * If inversion fails, returns the original buffer.
 *
 * NOTE: This helper is intentionally lightweight (<200 LOC) and uses
 * pure JS image-js implementation – no native bindings.
 */
export async function invertLogoBuffer(
  input: Buffer,
  logContext = "invertLogoBuffer",
): Promise<{ buffer: Buffer; contentType: string }> {
  // Detect original content-type so we can encode back with same format
  let detection: Pick<ProcessedImageResult, "processedBuffer" | "contentType">;
  try {
    detection = await processImageBufferSimple(input, logContext);
  } catch {
    // Fallback to generic PNG if detection fails
    detection = { processedBuffer: input, contentType: "image/png" };
  }

  const { processedBuffer, contentType } = detection;

  // Skip inversion for SVG – color inversion should be done via CSS filter.
  if (contentType === "image/svg+xml") {
    return { buffer: processedBuffer, contentType };
  }

  try {
    // Dynamically import image-js only when inversion is required to keep the
    // main bundle slim and prevent Webpack from attempting to bundle the
    // optional canvas dependency. The import is isolated into its own chunk
    // so node-only code is never shipped to the browser.
    const { Image /* webpackChunkName: "image-worker" */ } = (await import(
      /* webpackChunkName: "image-worker" */ "image-js"
    )) as { Image: typeof import("image-js").Image };

    const image = await Image.load(processedBuffer);
    const inverted = image.invert();

    // image-js expects a format keyword (png, jpg, webp, etc.) – map from MIME
    const format = contentType.replace(/^image\//, ""); // e.g., image/png -> png

    // Type-safe format validation for image-js toBuffer
    const validFormats = ["png", "jpg", "jpeg", "webp"] as const;
    const safeFormat = validFormats.includes(format as (typeof validFormats)[number])
      ? format
      : "png";

    const invertedBuffer = Buffer.from(inverted.toBuffer({ format: safeFormat }));
    return { buffer: invertedBuffer, contentType };
  } catch (error) {
    // On failure, return the original buffer to avoid breaking pipeline
    console.warn(
      `[${logContext}] Inversion failed – returning original buffer:`,
      (error as Error).message,
    );
    return { buffer: processedBuffer, contentType };
  }
}
