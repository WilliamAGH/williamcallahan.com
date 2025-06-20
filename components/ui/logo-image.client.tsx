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
import { type JSX } from "react";
import type { LogoImageProps } from "@/types";

export function LogoImage({
  src,
  width,
  height,
  alt = "Company Logo",
  className = "",
  priority = false,
}: LogoImageProps): JSX.Element {
  if (!src) {
    // Return a placeholder or null if src is not provided
    return <div style={{ width, height }} className="bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />;
  }

  // Use next/image for all image sources, including data URLs.
  // Next.js can handle base64 encoded strings directly.
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
    />
  );
}
