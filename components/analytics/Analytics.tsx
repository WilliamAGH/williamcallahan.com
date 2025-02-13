'use client'

import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { useEffect, useCallback } from 'react'

/**
 * Analytics Component
 * @module components/analytics/Analytics
 * @description
 * Handles pageview tracking for both Plausible and Umami analytics.
 * Implements queue system for handling events when scripts are not yet loaded.
 *
 * Related modules:
 * @see {@link "lib/analytics/queue"} - Queue system for handling analytics events
 * @see {@link "types/analytics"} - Analytics type definitions
 * @see {@link "public/scripts/plausible-init.js"} - Plausible initialization script
 *
 * External documentation:
 * @see https://umami.is/docs/tracker-functions - Umami tracking documentation
 * @see https://plausible.io/docs/custom-event-goals - Plausible events documentation
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
  if (typeof window !== 'undefined' && window.plausible) {
    try {
      // Fetch the IP address first
      fetch('/api/ip')
        .then(res => res.text())
        .then(ip => {
          console.log('[Plausible Debug] Client IP:', ip)
          const eventData = {
            ...createBaseEventData(),
            path,
            ip // Include IP in the event data for debugging
          }
          window.plausible('pageview', { props: eventData })
          console.log('[Plausible Debug] Event sent with data:', eventData)
        })
        .catch(error => {
          console.error('[Plausible Debug] Error getting IP:', error)
        })
    } catch (error) {
      console.error('Plausible tracking error:', error)
    }
  }
}

/**
 * Safely tracks a pageview in Umami
 * @param path - The normalized page path
 */
function trackUmami(path: string): void {
  if (typeof window !== 'undefined' && window.umami && typeof window.umami.track === 'function') {
    try {
      const eventData: UmamiEvent = {
        ...createBaseEventData(),
        path,
        hostname: window.location.hostname,
        website: process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID
      }
      window.umami.track('pageview', eventData)
    } catch (error) {
      console.error('Umami tracking error:', error)
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

  const trackPageview = useCallback((path: string) => {
    // Ensure we're in the browser
    if (typeof window === 'undefined') return
    trackPlausible(path)
    trackUmami(path)
  }, [])

  // Track page views on route changes
  useEffect(() => {
    if (!pathname) return

    const normalizedPath = pathname
      .replace(/\/blog\/[^/]+/, '/blog/:slug')
      .replace(/\?.+$/, '')

    // Debug analytics script status
    console.debug('[Analytics Debug] Script status:', {
      umamiLoaded: typeof window.umami?.track === 'function',
      plausibleLoaded: window.plausible !== undefined,
      path: normalizedPath
    })

    // Only track if scripts are loaded and initialized
    if ((window.umami && typeof window.umami.track === 'function') || window.plausible !== undefined) {
      console.debug('[Analytics Debug] Tracking pageview:', normalizedPath)
      trackPageview(normalizedPath)
    } else {
      console.debug('[Analytics Debug] Scripts not ready, skipping pageview')
    }
  }, [pathname, trackPageview])

  // Early return if missing config or not in browser
  if (typeof window === 'undefined' || !process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || !process.env.NEXT_PUBLIC_SITE_URL) {
    return null
  }

  const domain = new URL(process.env.NEXT_PUBLIC_SITE_URL).hostname
  const normalizedPath = pathname
    ? pathname.replace(/\/blog\/[^/]+/, '/blog/:slug').replace(/\?.+$/, '')
    : ''

  return (
    <>
      <Script
        id="umami"
        strategy="lazyOnload"
        src="https://umami.iocloudhost.net/script.js"
        data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
        onLoad={() => {
          console.debug('[Analytics Debug] Umami script loaded')
          if (normalizedPath) {
            console.debug('[Analytics Debug] Initial tracking:', normalizedPath)
            trackPageview(normalizedPath)
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
        onError={(e) => {
          console.error('[Analytics Error] Failed to load Plausible script:', e)
        }}
      />
    </>
  )
}
