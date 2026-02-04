/**
 * Logo source priority configuration
 * @module lib/services/image/logo-source-priority
 */

import { LOGO_SOURCES } from "@/lib/constants";
import type { LogoSource } from "@/types/logo";

export type LogoSourcePriority = {
  name: LogoSource;
  urlFn: (d: string) => string;
  size: string;
};

/**
 * Build prioritized logo source list from LOGO_SOURCES config
 */
export function getLogoSourcePriority(): LogoSourcePriority[] {
  const direct = LOGO_SOURCES.direct;
  const google = LOGO_SOURCES.google;
  const duckduckgo = LOGO_SOURCES.duckduckgo;
  const clearbit = LOGO_SOURCES.clearbit;

  // Define sources in priority order: high-quality direct → standard direct → third-party
  const rawSources: Array<{
    name: LogoSource;
    urlFn?: (d: string) => string;
    size: string;
  }> = [
    // High-quality direct icons
    { name: "direct", urlFn: direct.androidChrome512, size: "android-512" },
    { name: "direct", urlFn: direct.androidChrome192, size: "android-192" },
    { name: "direct", urlFn: direct.appleTouchIcon180, size: "apple-180" },
    { name: "direct", urlFn: direct.appleTouchIcon152, size: "apple-152" },
    { name: "direct", urlFn: direct.appleTouchIcon, size: "apple-touch" },
    { name: "direct", urlFn: direct.appleTouchIconPrecomposed, size: "apple-touch-precomposed" },
    // Standard favicon formats
    { name: "direct", urlFn: direct.faviconSvg, size: "favicon-svg" },
    { name: "direct", urlFn: direct.faviconPng, size: "favicon-png" },
    { name: "direct", urlFn: direct.favicon32, size: "favicon-32" },
    { name: "direct", urlFn: direct.favicon16, size: "favicon-16" },
    { name: "direct", urlFn: direct.favicon, size: "favicon-ico" },
    // Third-party services
    { name: "google", urlFn: google?.hd, size: "hd" },
    { name: "google", urlFn: google?.md, size: "md" },
    { name: "duckduckgo", urlFn: duckduckgo?.hd, size: "hd" },
    { name: "clearbit", urlFn: clearbit?.hd, size: "hd" },
  ];

  return rawSources.filter((source): source is LogoSourcePriority => source.urlFn !== undefined);
}
