import { extname } from "node:path";
import { IMAGE_MIME_TYPES } from "@/lib/utils/content-type";

/** One public path/type policy for both archive publication and HTTP relay. */
export function getArchivedAssetContentType(relativePath: string): string | undefined {
  const segments = relativePath.split("/");
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment.startsWith(".") ||
        /[\\\0]/.test(segment) ||
        /^sourcemaps?$/i.test(segment),
    )
  ) {
    return undefined;
  }
  const extension = extname(relativePath).slice(1).toLowerCase();
  if (segments[0] === "chunks") {
    if (extension === "js") return "application/javascript; charset=UTF-8";
    if (extension === "css") return "text/css; charset=UTF-8";
    return undefined;
  }
  if (segments[0] !== "media") return undefined;
  if (Object.hasOwn(IMAGE_MIME_TYPES, extension)) return IMAGE_MIME_TYPES[extension];
  switch (extension) {
    case "woff":
      return "font/woff";
    case "woff2":
      return "font/woff2";
    case "ttf":
      return "font/ttf";
    case "otf":
      return "font/otf";
    case "eot":
      return "application/vnd.ms-fontobject";
    default:
      return undefined;
  }
}
