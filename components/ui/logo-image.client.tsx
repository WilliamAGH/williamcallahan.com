/* eslint-disable @next/next/no-img-element */
/**
 * LogoImage Component
 *
 * A client-side component for displaying a company logo image.
 * Uses next/image for standard URLs and a plain <img> for data URLs
 * to ensure compatibility.
 *
 * @module components/ui/logo-image.client
 */

"use client";

import Image from "next/image"; // Import next/image
import React, { type JSX } from "react";
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
  // Determine if the src is a data URL
  const isDataUrl = src.startsWith("data:");

  if (isDataUrl) {
    // Render plain <img> for data URLs
    return (
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={`${className} object-contain`} // Apply className directly
        loading="lazy" // Standard lazy loading
      />
    );
  }

  // Use explicit width/height to avoid Next.js fill positioning issues
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
