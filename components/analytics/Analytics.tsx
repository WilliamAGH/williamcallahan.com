'use client'

import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { useEffect, useCallback } from 'react'

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
  if (typeof window.plausible === 'function') {
    try {
      const eventData = {
        ...createBaseEventData(),
        path // Override with normalized path
      }
      window.plausible('pageview', { props: eventData })
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
  if (window.umami?.track && typeof window.umami.track === 'function') {
    try {
      const eventData: UmamiEvent = {
        ...createBaseEventData(),
        path, // Override with normalized path
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
    trackPlausible(path)
    trackUmami(path)
  }, [])

  // Track pageview on route change
  useEffect(() => {
    if (!pathname) return

    // Simple path normalization for dynamic routes
    const path = pathname
      .replace(/\/blog\/[^/]+/, '/blog/:slug')
      .replace(/\?.+$/, '')

    // Small delay to ensure analytics scripts are loaded
    const timeoutId = setTimeout(() => {
      trackPageview(path)
    }, 100)

    return () => clearTimeout(timeoutId)
  }, [pathname, trackPageview])

  // Early return if missing config
  if (!process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || !process.env.NEXT_PUBLIC_SITE_URL) {
    return null
  }

  const domain = new URL(process.env.NEXT_PUBLIC_SITE_URL).hostname

  return (
    <>
      <Script
        id="umami"
        strategy="afterInteractive"
        src="https://umami.iocloudhost.net/script.js"
        data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
      />
      <Script
        id="plausible"
        strategy="afterInteractive"
        src="https://plausible.iocloudhost.net/js/script.js"
        data-domain={domain}
      />
    </>
  )
}
