/**
 * Modern Analytics Implementation for Next.js 16
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

/** Umami hard limit on event names (see GH issue #2986) */
const UMAMI_MAX_EVENT_NAME_LENGTH = 50;

/**
 * Analytics component following official provider documentation
 * - Umami: Auto-tracks pageviews via data attributes
 * - Plausible: Auto-tracks pageviews when loaded
 * - Simple Analytics: Auto-tracks pageviews
 * - Clicky: Auto-tracks pageviews
 */
export function Analytics(): JSX.Element | null {
  // Skip all analytics in development (compile-time constant; safe for dead-code elimination)
  if (process.env.NODE_ENV === "development") {
    return null;
  }

  // Resolve site URL from build-time env var (NEXT_PUBLIC_* inlined at build).
  // When missing, siteUrl is undefined — Umami and Plausible are deterministically
  // skipped on both server and client so missing config is immediately visible.
  const siteUrl = (() => {
    const envSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
    if (envSiteUrl && envSiteUrl.length > 0) return envSiteUrl;
    console.error("[Analytics] NEXT_PUBLIC_SITE_URL missing; Umami and Plausible will be disabled");
    return undefined;
  })();

  const umamiWebsiteId = (() => {
    const envWebsiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID?.trim();
    return envWebsiteId && envWebsiteId.length > 0 ? envWebsiteId : undefined;
  })();

  const domain = (() => {
    if (!siteUrl) return undefined;
    try {
      return new URL(siteUrl).hostname;
    } catch {
      console.error(`[Analytics] Cannot parse site URL "${siteUrl}"; Plausible will be disabled`);
      return undefined;
    }
  })();

  const shouldLoadUmami = (() => {
    if (!umamiWebsiteId || !siteUrl) return false;
    if (typeof window === "undefined") return false;
    try {
      void window.localStorage.length;
      return true;
    } catch {
      // localStorage unavailable (private browsing, storage disabled, or iframe sandbox).
      // Skip Umami rather than crash; Plausible/SA/Clicky still track without localStorage.
      console.warn("[Analytics] localStorage unavailable; skipping Umami");
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
          data-website-id={umamiWebsiteId}
          data-host-url={siteUrl}
          data-auto-track="true"
          onError={() => {
            console.warn("[Analytics] Failed to load Umami script - continuing without analytics");
          }}
        />
      )}

      {/* Plausible Analytics - Official docs: https://plausible.io/docs/script-extensions */}
      {domain && (
        <Script
          id="plausible"
          strategy="afterInteractive"
          src="https://plausible.iocloudhost.net/js/script.js"
          data-domain={domain}
          data-api="https://plausible.iocloudhost.net/api/event"
        />
      )}

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
      <Script
        id="clicky"
        strategy="afterInteractive"
        src="https://static.getclicky.com/101484018.js"
        async
      />
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
 *   • Truncates event names exceeding UMAMI_MAX_EVENT_NAME_LENGTH
 *   • Silently no-ops if Umami is unavailable (script blocked or disabled)
 */
export function safeTrack(name: string, data: Record<string, unknown> = {}): void {
  if (name.length > UMAMI_MAX_EVENT_NAME_LENGTH) {
    console.warn(
      `[analytics] Event name truncated to ${UMAMI_MAX_EVENT_NAME_LENGTH} chars: ${name}`,
    );
  }
  const eventName = name.slice(0, UMAMI_MAX_EVENT_NAME_LENGTH);
  try {
    window.umami?.track?.(eventName, data);
  } catch (error: unknown) {
    // [RC1] Always log tracking failures so production issues are visible
    console.warn("[analytics] Failed to track event:", { name: eventName, error });
  }
}
