/**
 * Hydration Safe Image Component
 *
 * This component ensures that images are rendered consistently between server and client.
 * It removes any Dark Reader attributes and normalizes positioning values to prevent hydration mismatches.
 *
 */

"use client";

import Image, { type ImageProps } from "next/image";
import { useEffect, useState } from "react";

/**
 * HydrationSafeImage component
 *
 * Prevents hydration mismatches by only rendering the image on the client side.
 * Accepts all Next.js Image props with a fallback for server rendering.
 */
export function HydrationSafeImage({ className = "", alt, ...props }: ImageProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    // Server-side or initial render placeholder
    return (
      <div
        className={`bg-gray-200 dark:bg-gray-700 animate-pulse ${className}`}
        style={{
          aspectRatio: props.width && props.height ? `${props.width}/${props.height}` : "auto",
        }}
        aria-label={alt}
      />
    );
  }

  // Client-side render with actual image
  return <Image className={className} alt={alt} {...props} />;
}
