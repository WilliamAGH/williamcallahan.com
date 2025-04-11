'use client'

import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { useEffect, useCallback, useState, Component, ErrorInfo } from 'react'

/**
 * Analytics event data structure based on official specs
 * @see https://umami.is/docs/tracker-functions
 * @see https://plausible.io/docs/custom-event-goals
 */
interface BaseAnalyticsEvent {
  /** Current page path (normalized for dynamic routes) */
  path: string
  /** Full page URL */
  url: string
  /** Page referrer */
  referrer: string
}

interface UmamiEvent extends BaseAnalyticsEvent {
  /** Website ID for tracking */
  website?: string
  /** Current hostname */
  hostname?: string
}

interface PlausibleEvent extends BaseAnalyticsEvent {
  /** Additional custom properties */
  [key: string]: unknown
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
    if (process.env.NODE_ENV !== 'production') {
      // Only log in development, silently fail in production
      // This prevents the error from being shown in the console
      // eslint-disable-next-line no-console
      console.warn('[Analytics] Error boundary caught:', {
        error: error.message,
        componentStack: errorInfo.componentStack
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
  if (typeof window === 'undefined') {
    return { path: '', url: '', referrer: '' };
  }

  try {
    return {
      path: window.location.pathname,
      url: window.location.href,
      referrer: document.referrer
    };
  } catch (err) {
    // Fallback if there's any issue accessing window/document
    return { path: '', url: '', referrer: '' };
  }
}

/**
 * Safely tracks a pageview in Plausible
 * @param path - The normalized page path
 */
function trackPlausible(path: string): void {
  if (typeof window === 'undefined') return;

  try {
    if (typeof window.plausible === 'function') {
      const eventData = {
        ...createBaseEventData(),
        path,
      }
      window.plausible('pageview', { props: eventData })
    }
  } catch (error) {
    // Silent failure in production, log in development
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[Analytics] Plausible tracking error - silent failure');
    }
  }
}

/**
 * Safely tracks a pageview in Umami
 * @param path - The normalized page path
 */
export function trackUmami(path: string): void {
  if (typeof window === 'undefined') return;

  try {
    if (window.umami?.track && typeof window.umami.track === 'function') {
      const eventData: UmamiEvent = {
        ...createBaseEventData(),
        path,
        hostname: window.location.hostname,
        website: process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID
      }
      window.umami.track('pageview', eventData)
    }
  } catch (error) {
    // Silent failure in production, log in development
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[Analytics] Umami tracking error - silent failure');
    }
  }
}

/**
 * Analytics scripts with error handling to prevent app crashes
 */
function AnalyticsScripts() {
  const pathname = usePathname()
  const [scriptsLoaded, setScriptsLoaded] = useState({
    umami: false,
    plausible: false
  })

  const trackPageview = useCallback((path: string, attempt = 1, maxAttempts = 3) => {
    if (typeof window === 'undefined') return

    try {
      const normalizedPath = path
        .replace(/\/blog\/[^/]+/, '/blog/:slug')
        .replace(/\?.+$/, '')

      if (scriptsLoaded.umami) {
        if (window.umami?.track && typeof window.umami.track === 'function') {
          trackUmami(normalizedPath)
        } else if (attempt < maxAttempts) {
          // Retry with exponential backoff
          setTimeout(() => {
            trackPageview(normalizedPath, attempt + 1, maxAttempts)
          }, attempt * 300) // Increase delay with each attempt
        }
      }

      if (scriptsLoaded.plausible) {
        trackPlausible(normalizedPath)
      }
    } catch (error) {
      // Silent error handling to prevent app crashes
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn('[Analytics] Error during page tracking');
      }
    }
  }, [scriptsLoaded])

  // Track page views on route changes
  useEffect(() => {
    if (!pathname) return

    // Don't continue if scripts aren't loaded
    if (!scriptsLoaded.umami && !scriptsLoaded.plausible) return

    try {
      const normalizedPath = pathname
        .replace(/\/blog\/[^/]+/, '/blog/:slug')
        .replace(/\?.+$/, '')

      // Add a longer delay to ensure scripts are fully initialized
      const trackingTimeout = setTimeout(() => {
        trackPageview(normalizedPath)
      }, 500) // Increased from 100ms to 500ms

      return () => clearTimeout(trackingTimeout)
    } catch (error) {
      // Silent failure
      return undefined;
    }
  }, [pathname, trackPageview, scriptsLoaded])

  // Early return if missing config or not in browser
  if (typeof window === 'undefined' || !process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || !process.env.NEXT_PUBLIC_SITE_URL) {
    return null
  }

  let domain;
  try {
    domain = new URL(process.env.NEXT_PUBLIC_SITE_URL).hostname;
  } catch (e) {
    // Fallback if URL parsing fails
    domain = 'williamcallahan.com';
  }

  // Safe error handlers that won't propagate errors
  const safeScriptErrorHandler = (source: string) => () => {
    // Only log in development, silently ignore in production
    if (process.env.NODE_ENV !== 'production') {
      // Use warn level instead of error to avoid triggering Next.js error handling
      // eslint-disable-next-line no-console
      console.warn(`[Analytics] Failed to load ${source} script - continuing without analytics`);
    }
  };

  return (
    <>
      <Script
        id="umami"
        strategy="lazyOnload"
        src="https://umami.iocloudhost.net/script.js"
        data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
        data-auto-track="false"
        data-do-not-track="false"
        data-cache="false"
        onLoad={() => {
          try {
            setScriptsLoaded(prev => ({ ...prev, umami: true }))
            if (pathname) {
              trackPageview(pathname)
            }
          } catch (e) {
            // Silent failure
          }
        }}
        onError={safeScriptErrorHandler('Umami')}
      />
      <Script
        id="plausible"
        strategy="lazyOnload"
        src="https://plausible.iocloudhost.net/js/script.js"
        data-domain={domain}
        data-api="https://plausible.iocloudhost.net/api/event"
        onLoad={() => {
          try {
            setScriptsLoaded(prev => ({ ...prev, plausible: true }))
            if (pathname) {
              trackPageview(pathname)
            }
          } catch (e) {
            // Silent failure
          }
        }}
        onError={safeScriptErrorHandler('Plausible')}
      />
    </>
  )
}

/**
 * Analytics component that handles pageview tracking
 * Supports both Plausible and Umami analytics
 * @returns JSX.Element | null
 */
export function Analytics(): JSX.Element | null {
  // Wrap in error boundary to prevent analytics issues from crashing the app
  return (
    <AnalyticsErrorBoundary>
      <AnalyticsScripts />
    </AnalyticsErrorBoundary>
  )
}
