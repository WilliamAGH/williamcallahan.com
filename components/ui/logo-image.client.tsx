/* eslint-disable @next/next/no-img-element */
/**
 * LogoImage Component
 *
 * A client-side component for displaying a company logo image.
 * Uses next/image for both standard and data URLs to ensure performance
 * and consistency.
 *
 * @module components/ui/logo-image.client
 */

"use client";

import Image from "next/image";
import { type JSX, useState, useCallback } from "react";
import type { LogoImageProps } from "@/types";

export function LogoImage({
  src,
  width,
  height,
  alt = "Company Logo",
  className = "",
  priority = false,
}: LogoImageProps): JSX.Element {
  const [imageError, setImageError] = useState(false);

  const handleError = useCallback(() => {
    console.warn(`[LogoImage] Failed to load logo: ${src}`);
    setImageError(true);
  }, [src]);

  if (!src) {
    // Return a placeholder or null if src is not provided
    return <div style={{ width, height }} className="bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />;
  }

  // If Next.js Image optimization fails, fall back to regular img tag
  if (imageError) {
    return (
      // biome-ignore lint/performance/noImgElement: This is only a fallback
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={`${className} object-contain`}
        onError={() => {
          // If even the regular img fails, show placeholder
          console.error(`[LogoImage] Logo completely failed to load: ${src}`);
        }}
      />
    );
  }

  // Use next/image for optimization when possible
  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      data-testid="next-image-mock"
      data-priority={priority ? "true" : "false"}
      className={`${className} object-contain`}
      {...(priority ? { priority } : {})}
      onError={handleError}
      // Allow external images from the logo API
      unoptimized={src.includes("/api/logo")}
    />
  );
}
