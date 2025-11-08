/**
 * Modern Analytics Implementation for Next.js 15
 * Following official documentation from each provider
 *
 * Key insights:
 * 1. These scripts handle SPAs automatically - no custom queue needed
 * 2. They track pageviews on load and route changes internally
 * 3. afterInteractive ensures they load at the right time
 */

"use client";

import Image from "next/image";
import Script from "next/script";
import type { JSX } from "react";

/**
 * Analytics component following official provider documentation
 * - Umami: Auto-tracks pageviews via data attributes
 * - Plausible: Auto-tracks pageviews when loaded
 * - Simple Analytics: Auto-tracks pageviews
 * - Clicky: Auto-tracks pageviews
 */
export function Analytics(): JSX.Element | null {
  // Determine if analytics should run for this render
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const shouldSkip =
    process.env.NODE_ENV === "development" ||
    !process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID ||
    !siteUrl ||
    siteUrl.trim().length === 0;

  if (shouldSkip) {
    return null;
  }

  const domain = (() => {
    try {
      return new URL(siteUrl).hostname;
    } catch {
      return "williamcallahan.com";
    }
  })();

  const shouldLoadUmami = (() => {
    if (typeof window === "undefined") {
      return false;
    }
    try {
      void window.localStorage.length;
      return true;
    } catch {
      return false;
    }
  })();

  return (
    <>
      {/* Umami Analytics - Official docs: https://umami.is/docs/install */}
      {shouldLoadUmami && (
        <Script
          id="umami"
          strategy="afterInteractive"
          src="/stats/script.js"
          data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
          data-host-url={siteUrl}
          data-auto-track="true"
        />
      )}

      {/* Plausible Analytics - Official docs: https://plausible.io/docs/script-extensions */}
      <Script
        id="plausible"
        strategy="afterInteractive"
        src="https://plausible.iocloudhost.net/js/script.js"
        data-domain={domain}
        data-api="https://plausible.iocloudhost.net/api/event"
      />

      {/* Simple Analytics - Official docs: https://docs.simpleanalytics.com/script */}
      <Script
        id="simple-analytics"
        strategy="afterInteractive"
        src="https://scripts.simpleanalyticscdn.com/latest.js"
        data-collect-dnt="true"
        async
      />
      <noscript>
        <Image
          src="https://queue.simpleanalyticscdn.com/noscript.gif?collect-dnt=true"
          alt=""
          referrerPolicy="no-referrer-when-downgrade"
          width={1}
          height={1}
        />
      </noscript>

      {/* Clicky Analytics - Official docs: https://clicky.com/help/custom */}
      <Script id="clicky" strategy="afterInteractive" src="https://static.getclicky.com/101484018.js" async />
      <noscript>
        <p>
          <Image alt="Clicky" width={1} height={1} src="https://in.getclicky.com/101484018ns.gif" />
        </p>
      </noscript>
    </>
  );
}

/**
 * safeTrack — defensive wrapper around window.umami.track
 *   • Truncates event names > 50 chars (Umami hard limit, see GH issue #2986)
 *   • Silently no-ops if Umami is unavailable (script blocked or disabled)
 */
export function safeTrack(name: string, data: Record<string, unknown> = {}): void {
  if (name.length > 50) {
    console.warn(`[analytics] Event name truncated to 50 chars: ${name}`);
    name = name.slice(0, 50);
  }
  try {
    window.umami?.track?.(name, data);
  } catch (error: unknown) {
    // Log error details in debug mode for better diagnosis
    if (process.env.NODE_ENV === "development" || process.env.DEBUG === "true") {
      console.error("[analytics] Failed to track event:", { name, data, error });
    }
    // Otherwise swallow to keep UI resilient
  }
}
