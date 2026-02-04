import { processImageBufferSimple } from "./shared-image-processing";
import type { ProcessedImageResult } from "@/types/image";

/**
 * Invert logo buffer preserving original format.
 * Returns the inverted buffer and original content-type.
 * If inversion fails, returns the original buffer.
 *
 * NOTE: This helper is intentionally lightweight (<200 LOC) and uses
 * pure JS image-js implementation – no native bindings.
 *
 * @see image-js v0.37.0 API verified from node_modules/image-js/index.d.ts:
 *   - Image.load(image: string | ArrayBuffer | Uint8Array): Promise<Image> (lines 35-38)
 *   - image.invert(options?: OutOrInplace): Image (line 75)
 *   - image.toBuffer(options?: SaveOptions): Uint8Array (line 67)
 *   - SaveOptions = { format?: string } (lines 598-602)
 * @see https://github.com/image-js/image-js (repository)
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
    console.warn(`[${logContext}] Content-type detection failed; defaulting to PNG output.`);
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

    // Image.load accepts ArrayBuffer|Uint8Array per index.d.ts:35-38
    const image = await Image.load(processedBuffer);
    // invert() returns new Image with inverted colors per index.d.ts:75
    const inverted = image.invert();

    // image-js expects a format keyword (png, jpg, webp, etc.) – map from MIME
    const format = contentType.replace(/^image\//, ""); // e.g., image/png -> png

    // Type-safe format validation for image-js toBuffer
    const validFormats = ["png", "jpg", "jpeg", "bmp"] as const;
    const safeFormat = validFormats.includes(format as (typeof validFormats)[number])
      ? format
      : "png";

    // toBuffer accepts SaveOptions.format per index.d.ts:67,598-602
    const invertedBuffer = Buffer.from(inverted.toBuffer({ format: safeFormat }));
    const outputContentType =
      safeFormat === "jpg" || safeFormat === "jpeg"
        ? "image/jpeg"
        : safeFormat === "bmp"
          ? "image/bmp"
          : "image/png";
    return { buffer: invertedBuffer, contentType: outputContentType };
  } catch (error) {
    // On failure, return the original buffer to avoid breaking pipeline
    console.warn(
      `[${logContext}] Inversion failed – returning original buffer:`,
      (error as Error).message,
    );
    return { buffer: processedBuffer, contentType };
  }
}
