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
import { type JSX, useState, useCallback, useRef } from "react";
import type { LogoImageProps } from "@/types";

/**
 * Extract domain from a logo src so we can hit the on-demand logo API.
 * Handles both explicit `domain=` query param and CDN paths like `/logos/example.com.png`.
 */
function extractDomainFromSrc(url: string): string | null {
  try {
    const parsed = new URL(url, typeof window !== "undefined" ? window.location.origin : undefined);
    const qp = parsed.searchParams.get("domain");
    if (qp) return qp;

    const match = parsed.pathname.match(/logos\/(.+?)\./);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function LogoImage({
  src,
  width,
  height,
  alt = "Company Logo",
  className = "",
  priority = false,
}: LogoImageProps): JSX.Element {
  const [imageError, setImageError] = useState(false);
  const [reloadKey, setReloadKey] = useState<number | null>(null);
  const retryInitiated = useRef(false);

  const handleError = useCallback(() => {
    if (retryInitiated.current) {
      // We already retried once – fallback permanently to placeholder
      console.error(`[LogoImage] Final failure loading logo src: ${src}`);
      setImageError(true);
      return;
    }

    retryInitiated.current = true;

    const domain = src ? extractDomainFromSrc(src) : null;
    if (domain) {
      // Fire and forget – trigger server fetch/upload
      void fetch(`/api/logo?domain=${encodeURIComponent(domain)}`).catch(() => {
        /* silent */
      });
    }

    // Wait 3 s then retry the CDN URL with cache-buster
    setTimeout(() => {
      if (!src) {
        setImageError(true);
        return;
      }
      console.warn(`[LogoImage] Retrying logo load with cache-buster: ${src}`);
      setReloadKey(Date.now());
    }, 3000);
  }, [src]);

  if (!src) {
    // Return a placeholder or null if src is not provided
    return <div style={{ width, height }} className="bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />;
  }

  // After an unrecoverable error, show placeholder
  if (imageError) {
    return <div style={{ width, height }} className="bg-gray-200 dark:bg-gray-700 rounded" />;
  }

  const displaySrc = reloadKey ? `${src}${src.includes("?") ? "&" : "?"}cb=${reloadKey}` : src;

  // Use next/image for optimization when possible
  return (
    <Image
      src={displaySrc}
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
