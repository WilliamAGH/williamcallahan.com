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
  if (typeof window !== 'undefined' && typeof window.plausible === 'function') {
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

  useEffect(() => {
    if (!pathname || typeof window === 'undefined') return

    const path = pathname
      .replace(/\/blog\/[^/]+/, '/blog/:slug')
      .replace(/\?.+$/, '')

    // Increased delay to ensure scripts are fully loaded
    const timeoutId = setTimeout(() => {
      trackPageview(path)
    }, 500)

    return () => clearTimeout(timeoutId)
  }, [pathname, trackPageview])

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
      />
      <Script
        id="plausible"
        strategy="lazyOnload"
        src="https://plausible.iocloudhost.net/js/script.js"
        data-domain={domain}
      />
    </>
  )
}
