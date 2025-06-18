/* eslint-disable @next/next/no-img-element */
/**
 * Client-side component for loading and managing third-party analytics scripts.
 * Includes Plausible, Umami, Simple Analytics, and Clicky.
 */

"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";
import type React from "react";
import { Component, type ErrorInfo, type JSX, useCallback, useEffect, useState } from "react";

/**
 * Analytics event data structure based on official specs
 * @see https://umami.is/docs/tracker-functions
 * @see https://plausible.io/docs/custom-event-goals
 */
interface BaseAnalyticsEvent {
  /** Current page path (normalized for dynamic routes) */
  path: string;
  /** Full page URL */
  url: string;
  /** Page referrer */
  referrer: string;
}

interface UmamiEvent extends BaseAnalyticsEvent {
  /** Website ID for tracking */
  website?: string;
  /** Current hostname */
  hostname?: string;
  /** Allow additional properties for event data compatibility */
  [key: string]: unknown;
}

// Used for type checking but not directly referenced
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface PlausibleEvent extends BaseAnalyticsEvent {
  /** Additional custom properties */
  [key: string]: unknown;
}

/**
 * Error Boundary component to prevent analytics errors from affecting the main app
 */
class AnalyticsErrorBoundary extends Component<{ children: React.ReactNode }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error but don't crash the app
    // Use a more defensive approach that won't trigger Next.js error handling
    if (process.env.NODE_ENV !== "production") {
      // Only log in development, silently fail in production
      // This prevents the error from being shown in the console

      console.warn("[Analytics] Error boundary caught:", {
        error: error.message,
        componentStack: errorInfo.componentStack,
      });
    }
  }

  render() {
    if (this.state.hasError) {
      // Silent failure - don't show any UI for analytics errors
      return null;
    }

    return this.props.children;
  }
}

/**
 * Creates base analytics event data
 * @returns Base analytics event data
 */
function createBaseEventData(): BaseAnalyticsEvent {
  if (typeof window === "undefined") {
    return { path: "", url: "", referrer: "" };
  }

  try {
    return {
      path: window.location.pathname,
      url: window.location.href,
      referrer: document.referrer,
    };
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (err) {
    // Fallback if there's any issue accessing window/document
    return { path: "", url: "", referrer: "" };
  }
}

/**
 * Safely tracks a pageview in Plausible
 * @param path - The normalized page path
 */
function trackPlausible(path: string): void {
  if (typeof window === "undefined") return;

  try {
    if (typeof window.plausible === "function") {
      const eventData = {
        ...createBaseEventData(),
        path,
      };
      window.plausible("pageview", { props: eventData });
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    // Silent failure in production, log in development
    if (process.env.NODE_ENV !== "production") {
      console.warn("[Analytics] Plausible tracking error - silent failure");
    }
  }
}

/**
 * Safely tracks a pageview in Umami
 * @param path - The normalized page path
 */
export function trackUmami(path: string): void {
  if (typeof window === "undefined") return;

  try {
    if (window.umami?.track && typeof window.umami.track === "function") {
      const eventData: UmamiEvent = {
        ...createBaseEventData(),
        path,
        hostname: window.location.hostname,
        website: process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID,
      };
      window.umami.track("pageview", eventData);
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    // Silent failure in production, log in development
    if (process.env.NODE_ENV !== "production") {
      console.warn("[Analytics] Umami tracking error - silent failure");
    }
  }
}

/**
 * Analytics scripts with error handling to prevent app crashes
 */
function AnalyticsScripts() {
  // All hooks must be called unconditionally at the top level
  const pathname = usePathname();
  const [scriptsLoaded, setScriptsLoaded] = useState({
    umami: false,
    plausible: false,
    clicky: false,
  });
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const trackPageview = useCallback(
    (path: string) => {
      if (!path) return;

      const normalizedPath = path.replace(/\?.+$/, "");

      try {
        if (scriptsLoaded.umami) {
          trackUmami(normalizedPath);
        }

        if (scriptsLoaded.plausible) {
          trackPlausible(normalizedPath);
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error) {
        // Silent error handling to prevent app crashes
        return;
      }
    },
    [scriptsLoaded],
  );

  // Track page views on route changes
  useEffect(() => {
    if (!pathname) return;

    // Don't continue if scripts aren't loaded
    if (!scriptsLoaded.umami && !scriptsLoaded.plausible && !scriptsLoaded.clicky) return;

    try {
      const normalizedPath = pathname.replace(/\/blog\/[^/]+/, "/blog/:slug").replace(/\?.+$/, "");

      // Add a longer delay to ensure scripts are fully initialized
      const trackingTimeout = setTimeout(() => {
        trackPageview(normalizedPath);
        // Use the now typed window.clicky
        if (window.clicky) {
          window.clicky.pageview(normalizedPath);
        }
      }, 500); // Increased from 100ms to 500ms

      return () => clearTimeout(trackingTimeout);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      // Silent failure
      return undefined;
    }
  }, [pathname, trackPageview, scriptsLoaded]);

  // Prevent loading analytics scripts only on localhost during development, or if env vars are missing
  if (
    (typeof window !== "undefined" &&
      window.location.hostname === "localhost" &&
      process.env.NODE_ENV === "development") ||
    typeof window === "undefined" ||
    !process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID ||
    !process.env.NEXT_PUBLIC_SITE_URL
  ) {
    if (
      process.env.NODE_ENV === "development" &&
      typeof window !== "undefined" &&
      window.location.hostname === "localhost"
    ) {
      console.info("[Analytics] Skipping analytics script loading on localhost.");
    }
    return null;
  }

  let domain: string;
  try {
    if (!process.env.NEXT_PUBLIC_SITE_URL) {
      if (process.env.NODE_ENV === "development") {
        console.warn(
          "[Analytics] NEXT_PUBLIC_SITE_URL is not defined. Falling back to default domain.",
        );
      }
      throw new Error("NEXT_PUBLIC_SITE_URL is not defined");
    }
    domain = new URL(process.env.NEXT_PUBLIC_SITE_URL).hostname;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (e) {
    // Fallback if URL parsing fails or env var is missing
    domain = "williamcallahan.com";
  }

  // Safe error handlers that won't propagate errors
  const safeScriptErrorHandler = (source: string) => () => {
    // Always warn on script load errors
    console.warn(`[Analytics] Failed to load ${source} script - continuing without analytics`);
  };

  return (
    <>
      {process.env.NODE_ENV === "production" && (
        <Script
          id="umami"
          strategy="lazyOnload"
          src={`https://umami.iocloudhost.net/script.js?t=${Date.now()}`}
          data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
          data-cache="false"
          onLoad={() => {
            try {
              setScriptsLoaded((prev) => ({ ...prev, umami: true }));
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (e) {
              // Silent failure
            }
          }}
          onError={safeScriptErrorHandler("Umami")}
        />
      )}
      <Script
        id="plausible"
        strategy="lazyOnload"
        src={`https://plausible.iocloudhost.net/js/script.js?t=${Date.now()}`}
        data-domain={domain}
        data-api="https://plausible.iocloudhost.net/api/event"
        onLoad={() => {
          try {
            setScriptsLoaded((prev) => ({ ...prev, plausible: true }));
            if (pathname) {
              trackPageview(pathname);
            }
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
          } catch (e) {
            // Silent failure
          }
        }}
        onError={safeScriptErrorHandler("Plausible")}
      />
      {/* Simple Analytics */}
      <Script
        id="simple-analytics"
        strategy="lazyOnload"
        src="https://scripts.simpleanalyticscdn.com/latest.js"
        data-collect-dnt="true"
        onLoad={() => {
          // Optional: Add logic if needed after Simple Analytics loads
          if (process.env.NODE_ENV === "development") {
            console.log("[Analytics] Simple Analytics script loaded.");
          }
        }}
        onError={safeScriptErrorHandler("Simple Analytics")}
      />
      {isMounted && (
        <noscript>
          <img
            src="https://queue.simpleanalyticscdn.com/noscript.gif?collect-dnt=true"
            alt=""
            referrerPolicy="no-referrer-when-downgrade"
          />
        </noscript>
      )}

      {/* Clicky Analytics */}
      {/* Using Next/Script component, equivalent to <script async src="..."> */}
      <Script
        id="clicky-analytics"
        strategy="afterInteractive" // Use afterInteractive to mimic 'async' behavior
        src="https://static.getclicky.com/101484018.js" // Use https protocol
        onLoad={() => {
          if (process.env.NODE_ENV === "development") {
            console.log("[Analytics] Clicky script loaded.");
          }
          setScriptsLoaded((prev) => ({ ...prev, clicky: true }));
        }}
        onError={safeScriptErrorHandler("Clicky")}
      />
      {isMounted && (
        <noscript>
          {/* Standard Clicky noscript tag */}
          <p>
            <img alt="Clicky" width="1" height="1" src="https://in.getclicky.com/101484018ns.gif" />
          </p>{" "}
          {/* Use https protocol */}
        </noscript>
      )}
    </>
  );
}

/**
 * Analytics component that handles pageview tracking
 * Supports Plausible, Umami, Simple Analytics, and Clicky
 * @returns JSX.Element | null
 */
export function Analytics(): JSX.Element | null {
  // Wrap in error boundary to prevent analytics issues from crashing the app
  return (
    <AnalyticsErrorBoundary>
      <AnalyticsScripts />
    </AnalyticsErrorBoundary>
  );
}
