/**
 * Base64Image component for safely rendering base64/data URL images
 *
 * Prevents width/height warnings by ensuring proper aspect ratio is maintained
 * and using client-side rendering to avoid hydration issues
 */

"use client";

import Image, { type ImageProps } from "next/image";
import { type JSX, useEffect, useState } from "react";

export function Base64Image({ className = "", alt = "", width, height, ...props }: ImageProps): JSX.Element {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    // Server-side or initial render placeholder
    const aspectRatio = width && height ? `${width}/${height}` : undefined;

    return (
      <div
        className={`bg-gray-200 dark:bg-gray-700 animate-pulse ${className}`}
        style={{ aspectRatio, width: "100%", height: aspectRatio ? "auto" : "200px" }}
        role="img"
        aria-label={alt}
      />
    );
  }

  // Client-side render with proper aspect ratio
  return (
    <Image
      className={className}
      alt={alt || ""}
      width={width}
      height={height}
      style={{ width: "100%", height: "auto" }} // Key fix: always maintain aspect ratio
      unoptimized // Skip optimization for base64 images
      {...props}
    />
  );
}
