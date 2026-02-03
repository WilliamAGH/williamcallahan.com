/**
 * LogoImage Component
 *
 * A client-side component for displaying a company logo image.
 * Uses next/image for both standard and data URLs to ensure performance
 * and consistency, while marking `/api/*` sources as `unoptimized`
 * so we stay inside the contract described in
 * https://nextjs.org/docs/app/api-reference/components/image#unoptimized.
 *
 * @module components/ui/logo-image.client
 */

"use client";

import Image from "next/image";
import React, { useState, useCallback, useRef } from "react";
import type { LogoImageProps, OptimizedCardImageProps } from "@/types/ui/image";
import { getOptimizedImageSrc } from "@/lib/utils/cdn-utils";
import {
  getCompanyPlaceholder,
  COMPANY_PLACEHOLDER_BASE64,
} from "@/lib/data-access/placeholder-images";
import { getMonotonicTime } from "@/lib/utils";

const LOGO_FILENAME_REGEX = /\/logos\/(?:inverted\/)?([^/?#]+)\.(?:png|jpe?g|webp|svg|ico|avif)$/i;
const HASH_TOKEN = /^[a-f0-9]{8}$/i;
const KNOWN_LOGO_SOURCES = new Set([
  "google",
  "duckduckgo",
  "ddg",
  "clearbit",
  "direct",
  "manual",
  "unknown",
  "api",
]);

/**
 * Maximum width for proxied card images.
 * Card images display at ~600px max (see sizes prop), so 1200px provides
 * 2x resolution for high-DPI displays without excessive bandwidth.
 */
const CARD_IMAGE_PROXY_WIDTH = 1200;

/**
 * Proxies external URLs through the image cache API. Local paths and data URLs
 * are returned unchanged.
 */
function getProxiedImageSrc(src: string | null | undefined, width?: number): string | undefined {
  // Skip proxying for: empty values, local paths (including /api/*), and data URLs
  if (!src || src.startsWith("/") || src.startsWith("data:") || !/^https?:\/\//i.test(src)) {
    return src ?? undefined;
  }
  return getOptimizedImageSrc(src, undefined, width);
}

function deriveDomainFromLogoKey(pathname: string): string | null {
  const match = pathname.match(LOGO_FILENAME_REGEX);
  if (!match) {
    return null;
  }

  const [, filename] = match;
  if (!filename) {
    return null;
  }

  const tokens = filename.split("_").filter(Boolean);
  if (tokens.length < 2) {
    return null;
  }

  const maybeHash = tokens[tokens.length - 1] ?? "";
  const maybeSource = tokens[tokens.length - 2] ?? "";

  let domainTokens = tokens;

  if (HASH_TOKEN.test(maybeHash) && KNOWN_LOGO_SOURCES.has(maybeSource)) {
    domainTokens = tokens.slice(0, -2);
  } else if (KNOWN_LOGO_SOURCES.has(maybeHash)) {
    domainTokens = tokens.slice(0, -1);
  }

  if (domainTokens.length < 2) {
    return null;
  }

  const tld = domainTokens.pop();
  if (!tld) {
    return null;
  }

  const domainName = domainTokens.join(".");
  if (!domainName) {
    return null;
  }

  return `${domainName}.${tld}`.toLowerCase();
}

/**
 * Extract domain from a logo src so we can hit the on-demand logo API.
 * Handles both explicit `domain=` query param and CDN paths like `/logos/example.com.png`.
 * Mirrors the filename contract defined in `generateS3Key` (lib/utils/hash-utils.ts)
 * so `/api/logo` always receives a canonical hostname instead of the hashed CDN key.
 */
function extractDomainFromSrc(url: string): string | null {
  try {
    const parsed = new URL(url, typeof window !== "undefined" ? window.location.origin : undefined);
    const qp = parsed.searchParams.get("domain") ?? parsed.searchParams.get("website");
    if (qp?.trim()) return qp.trim().toLowerCase();

    return deriveDomainFromLogoKey(parsed.pathname);
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
  needsInversion = false,
}: LogoImageProps & { needsInversion?: boolean }): React.JSX.Element {
  const isDev = process.env.NODE_ENV === "development";
  const [imageError, setImageError] = useState(false);
  const [reloadKey, setReloadKey] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const retryInitiated = useRef(false);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const proxiedSrc = React.useMemo(() => getProxiedImageSrc(src, width), [src, width]);

  const handleError = useCallback(() => {
    if (retryInitiated.current) {
      // We already retried once – fallback permanently to placeholder
      if (isDev) console.error(`[LogoImage] Final failure loading logo src: ${src}`);
      setImageError(true);
      setIsLoading(false);
      return;
    }

    retryInitiated.current = true;

    const domain = src ? extractDomainFromSrc(src) : null;
    if (domain) {
      // Fire and forget – trigger server fetch/upload with correct parameter and force refresh
      void fetch(`/api/logo?website=${encodeURIComponent(domain)}&forceRefresh=true`).catch(() => {
        /* silent */
      });
    }

    // Wait 3 s then retry the CDN URL with cache-buster
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }
    retryTimeoutRef.current = setTimeout(() => {
      if (!src) {
        setImageError(true);
        setIsLoading(false);
        return;
      }
      if (isDev) console.warn(`[LogoImage] Retrying logo load with cache-buster: ${src}`);
      setReloadKey(Date.now());
    }, 3000);
  }, [src, isDev]);

  React.useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  if (!proxiedSrc || imageError) {
    return (
      <Image
        src={getCompanyPlaceholder()}
        alt={alt}
        width={width}
        height={height}
        className={`${className} object-contain`}
        priority={priority}
      />
    );
  }

  const displaySrc =
    reloadKey && proxiedSrc
      ? `${proxiedSrc}${proxiedSrc.includes("?") ? "&" : "?"}cb=${reloadKey}`
      : proxiedSrc;

  const shouldBypassOptimizer =
    typeof displaySrc === "string" &&
    (displaySrc.startsWith("/api/") || displaySrc.startsWith("data:"));

  return (
    <div style={{ position: "relative", width, height }} className="inline-block">
      {isLoading && (
        <Image
          src={COMPANY_PLACEHOLDER_BASE64}
          alt={alt}
          width={width}
          height={height}
          className={`${className} object-contain`}
          style={{ position: "absolute", top: 0, left: 0 }}
          priority={priority}
          unoptimized
        />
      )}
      <Image
        src={displaySrc}
        alt={alt}
        width={width}
        height={height}
        data-testid="next-image-mock"
        data-priority={priority ? "true" : "false"}
        className={`${className} object-contain ${needsInversion ? "dark:invert dark:brightness-90" : ""}`}
        style={{ opacity: isLoading ? 0 : 1, transition: "opacity 0.2s ease-in-out" }}
        {...(priority ? { priority } : {})}
        {...(shouldBypassOptimizer ? { unoptimized: true } : {})}
        onError={handleError}
        onLoad={() => {
          setIsLoading(false);
          if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
        }}
      />
    </div>
  );
}

// ------------------------------------------------------------------
// OptimizedCardImage – shared helper for cards (projects, bookmarks, blog)
// ------------------------------------------------------------------

import Placeholder from "@/public/images/opengraph-placeholder.png";

export function OptimizedCardImage({
  src,
  alt,
  className = "",
  preload = false,
  blurDataURL,
}: OptimizedCardImageProps): React.JSX.Element {
  const isDev = process.env.NODE_ENV === "development";
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  const MAX_RETRIES = 2;
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hasBlur = Boolean(blurDataURL);

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  const proxiedSrc = React.useMemo(() => getProxiedImageSrc(src, CARD_IMAGE_PROXY_WIDTH), [src]);

  if (!src) {
    return (
      <Image
        src={Placeholder}
        alt={alt}
        fill
        placeholder="empty"
        className="object-cover"
        {...(preload ? { preload, fetchPriority: "high" as const } : {})}
      />
    );
  }

  if (errored && retryCount >= MAX_RETRIES) {
    return (
      <Image
        src={Placeholder}
        alt={alt}
        fill
        placeholder="empty"
        className="object-cover"
        {...(preload ? { preload, fetchPriority: "high" as const } : {})}
      />
    );
  }

  if (!proxiedSrc) {
    return <Image src={Placeholder} alt={alt} fill placeholder="empty" className="object-cover" />;
  }

  const displaySrc =
    retryKey > 0
      ? `${proxiedSrc}${proxiedSrc.includes("?") ? "&" : "?"}retry=${retryKey}`
      : proxiedSrc;

  const shouldBypassOptimizer =
    typeof displaySrc === "string" &&
    (displaySrc.startsWith("/api/") || displaySrc.startsWith("data:"));

  return (
    <Image
      src={displaySrc}
      alt={alt}
      fill
      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 600px"
      quality={80}
      placeholder={hasBlur ? "blur" : "empty"}
      blurDataURL={blurDataURL}
      className={`object-cover transition-opacity duration-200 ${className}`}
      style={{ opacity: loaded || hasBlur ? 1 : 0.2 }}
      {...(preload ? { preload, fetchPriority: "high" as const } : {})}
      {...(shouldBypassOptimizer ? { unoptimized: true } : {})}
      onLoad={() => {
        setLoaded(true);
        setErrored(false);
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
        }
      }}
      onError={() => {
        if (retryCount < MAX_RETRIES) {
          if (isDev) console.log(`[OptimizedCardImage] Scheduling retry for URL: ${src}`);
          const backoffDelay = Math.min(1000 * 2 ** retryCount, 5000);

          if (retryTimeoutRef.current) {
            clearTimeout(retryTimeoutRef.current);
          }
          retryTimeoutRef.current = setTimeout(() => {
            setRetryCount((prev) => prev + 1);
            setRetryKey(getMonotonicTime());
          }, backoffDelay);
        } else {
          setErrored(true);
        }
      }}
    />
  );
}
