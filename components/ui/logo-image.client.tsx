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

'use client';

import React, { type JSX } from "react";
import Image from 'next/image'; // Import next/image

interface LogoImageProps {
  /** Source URL for the image (can be a regular URL or a data URL) */
  src: string;
  /** Width of the image in pixels */
  width: number;
  /** Height of the image in pixels */
  height: number;
  /** Alternate text for accessibility */
  alt?: string;
  /** Additional CSS classes to apply to the container/image */
  className?: string;
  /** Optional: Priority loading (only applies to next/image) */
  priority?: boolean;
}

export function LogoImage({
  src,
  width,
  height,
  alt = "Company Logo",
  className = "",
  priority = false,
}: LogoImageProps): JSX.Element {
  // Determine if the src is a data URL
  const isDataUrl = src.startsWith('data:');

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

  // Render next/image for standard URLs
  return (
    // Wrapper div needed for layout="fill"
    <div data-testid="logo-image-wrapper" className={`relative ${className}`} style={{ width, height }}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes="100vw" // Add sizes prop
        style={{ objectFit: 'contain' }} // Add style for object-fit
        priority={priority}
      />
    </div>
  );
}
