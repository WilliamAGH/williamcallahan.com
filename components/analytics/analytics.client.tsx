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
  // Skip analytics on localhost during development
  if (
    typeof window !== "undefined" &&
    window.location.hostname === "localhost" &&
    process.env.NODE_ENV === "development"
  ) {
    console.info("[Analytics] Skipping analytics on localhost");
    return null;
  }

  // Ensure required environment variables exist
  if (!process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || !process.env.NEXT_PUBLIC_SITE_URL) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[Analytics] Missing required environment variables");
    }
    return null;
  }

  const domain = (() => {
    try {
      return new URL(process.env.NEXT_PUBLIC_SITE_URL).hostname;
    } catch {
      return "williamcallahan.com";
    }
  })();

  return (
    <>
      {/* Umami Analytics - Official docs: https://umami.is/docs/install */}
      <Script
        id="umami"
        strategy="afterInteractive"
        src="https://umami.iocloudhost.net/script.js"
        data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
        data-auto-track="true"
        data-do-not-track="true"
        data-cache="false"
      />

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
      <Script
        id="clicky"
        strategy="afterInteractive"
        src="https://static.getclicky.com/101484018.js"
        async
      />
      <noscript>
        <p>
          <Image 
            alt="Clicky" 
            width={1} 
            height={1} 
            src="https://in.getclicky.com/101484018ns.gif" 
          />
        </p>
      </noscript>
    </>
  );
}
