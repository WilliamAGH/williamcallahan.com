'use client'

import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { useEffect, useCallback } from 'react'

/**
 * Analytics event data structure
 * @interface AnalyticsEvent
 */
interface AnalyticsEvent {
  /** Current page path (normalized for dynamic routes) */
  path: string
  /** Client IP address from server */
  ip?: string
  /** Full page URL */
  url: string
  /** Page referrer */
  referrer: string
  /** Client user agent */
  userAgent: string
  /** Client language */
  language: string
  /** Viewport width */
  screenWidth: number
  /** Viewport height */
  screenHeight: number
}

/**
 * Creates analytics event data
 * @param path - The normalized page path
 * @param ip - Optional client IP address
 * @returns Analytics event data object
 */
function createEventData(path: string, ip?: string): AnalyticsEvent {
  return {
    path,
    ...(ip && { ip }),
    url: window.location.href,
    referrer: document.referrer,
    userAgent: navigator.userAgent,
    language: navigator.language,
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight
  }
}

/**
 * Safely tracks a pageview in Plausible
 * @param eventData - The analytics event data
 */
function trackPlausible(eventData: AnalyticsEvent): void {
  if (typeof window.plausible === 'function') {
    try {
      window.plausible('pageview', { props: eventData })
    } catch (error) {
      console.error('Plausible tracking error:', error)
    }
  }
}

/**
 * Safely tracks a pageview in Umami
 * @param eventData - The analytics event data
 */
function trackUmami(eventData: AnalyticsEvent): void {
  if (window.umami?.track && typeof window.umami.track === 'function') {
    try {
      window.umami.track('pageview', eventData)
    } catch (error) {
      console.error('Umami tracking error:', error)
    }
  }
}

/**
 * Analytics component that handles pageview tracking
 * Supports both Plausible and Umami analytics
 * Tracks detailed event data including client IP (via API)
 * @returns JSX.Element | null
 */
export function Analytics(): JSX.Element | null {
  const pathname = usePathname()

  const trackPageview = useCallback(async (path: string) => {
    try {
      const ip = await fetch('/api/ip').then(res => res.text())
      const eventData = createEventData(path, ip)

      trackPlausible(eventData)
      trackUmami(eventData)
    } catch (error) {
      // Fallback with basic data if IP fetch fails
      const eventData = createEventData(path)
      trackPlausible(eventData)
      trackUmami(eventData)
      console.error('Analytics IP fetch error:', error)
    }
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
