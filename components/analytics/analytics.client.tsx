'use client'

import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { useEffect, useCallback, useState } from 'react'

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
 * Creates base analytics event data
 * @returns Base analytics event data
 */
function createBaseEventData(): BaseAnalyticsEvent {
  return {
    path: window.location.pathname,
    url: window.location.href,
    referrer: document.referrer
  }
}

/**
 * Safely tracks a pageview in Plausible
 * @param path - The normalized page path
 */
function trackPlausible(path: string): void {
  if (typeof window !== 'undefined' && typeof window.plausible === 'function') {
    try {
      const eventData = {
        ...createBaseEventData(),
        path,
      }
      window.plausible('pageview', { props: eventData })
    } catch (error) {
      console.error('[Analytics Error] Plausible tracking error:', error)
    }
  }
}

/**
 * Safely tracks a pageview in Umami
 * @param path - The normalized page path
 */
export function trackUmami(path: string): void {
  if (typeof window !== 'undefined' && window.umami?.track && typeof window.umami.track === 'function') {
    try {
      const eventData: UmamiEvent = {
        ...createBaseEventData(),
        path,
        hostname: window.location.hostname,
        website: process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID
      }
      window.umami.track('pageview', eventData)
    } catch (error) {
      console.error('[Analytics Error] Umami tracking error:', error)
    }
  }
}

/**
 * Analytics component that handles pageview tracking
 * Supports both Plausible and Umami analytics
 * @returns JSX.Element | null
 */
export function Analytics(): JSX.Element | null {
  const pathname = usePathname()
  const [scriptsLoaded, setScriptsLoaded] = useState({
    umami: false,
    plausible: false
  })

  const trackPageview = useCallback((path: string, attempt = 1, maxAttempts = 3) => {
    if (typeof window === 'undefined') return

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
  }, [scriptsLoaded])

  // Track page views on route changes
  useEffect(() => {
    if (!pathname) return

    // Don't continue if scripts aren't loaded
    if (!scriptsLoaded.umami && !scriptsLoaded.plausible) return

    const normalizedPath = pathname
      .replace(/\/blog\/[^/]+/, '/blog/:slug')
      .replace(/\?.+$/, '')

    // Add a longer delay to ensure scripts are fully initialized
    const trackingTimeout = setTimeout(() => {
      trackPageview(normalizedPath)
    }, 500) // Increased from 100ms to 500ms

    return () => clearTimeout(trackingTimeout)
  }, [pathname, trackPageview, scriptsLoaded])

  // Early return if missing config or not in browser
  if (typeof window === 'undefined' || !process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || !process.env.NEXT_PUBLIC_SITE_URL) {
    return null
  }

  const domain = new URL(process.env.NEXT_PUBLIC_SITE_URL).hostname

  return (
    <>
      <Script
        id="umami"
        strategy="lazyOnload"
        src="https://umami.iocloudhost.net/script.js"
        data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
        data-auto-track="false"
        data-do-not-track="true"
        data-cache="true"
        onLoad={() => {
          setScriptsLoaded(prev => ({ ...prev, umami: true }))
          if (pathname) {
            trackPageview(pathname)
          }
        }}
        onError={(e) => {
          console.error('[Analytics Error] Failed to load Umami script:', e)
        }}
      />
      <Script
        id="plausible"
        strategy="lazyOnload"
        src="https://plausible.iocloudhost.net/js/script.js"
        data-domain={domain}
        data-api="https://plausible.iocloudhost.net/api/event"
        onLoad={() => {
          setScriptsLoaded(prev => ({ ...prev, plausible: true }))
          if (pathname) {
            trackPageview(pathname)
          }
        }}
        onError={(e) => {
          console.error('[Analytics Error] Failed to load Plausible script:', e)
        }}
      />
    </>
  )
}
