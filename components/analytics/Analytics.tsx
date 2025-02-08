'use client'

import Script from 'next/script'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'

const PLAUSIBLE_URL = 'https://plausible.iocloudhost.net'

export function Analytics() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const timeoutId = useRef<NodeJS.Timeout | null>(null)

    // Normalize dynamic routes
    const getNormalizedPath = (path: string) => {
        return path
            .replace(/\/blog\/[^/]+/, '/blog/:slug')
            .replace(/\/investments.*/, '/investments')
            .replace(/\/education.*/, '/education')
            .replace(/\/experience.*/, '/experience')
            .replace(/\/bookmarks.*/, '/bookmarks')
            .replace(/\?.+$/, ''); // Remove query params
    };

    const trackPageView = (path: string) => {
        const data = {
            path,
            timestamp: new Date().toISOString(),
            referrer: document.referrer,
            userAgent: navigator.userAgent,
            // Add any client-specific data
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,
            language: navigator.language
        }

        try {
            if (window.plausible) {
                window.plausible('pageview', { props: data })
            }
            if (window.umami) {
                window.umami.track('pageview', data)
            }
        } catch (error) {
            console.error('Analytics Error:', error)
        }
    }

  useEffect(() => {
    const normalizedPath = getNormalizedPath(pathname || '')

    // Debounced tracking (shorter: 150ms)
    timeoutId.current = setTimeout(() => {
      trackPageView(normalizedPath)
    }, 150)

    // Flush on unmount
    return () => {
      if (timeoutId.current) {
        clearTimeout(timeoutId.current)
        trackPageView(normalizedPath) // Immediate send
      }
    }
  }, [pathname, searchParams])

  // Early return if missing config
  if (!process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || !process.env.NEXT_PUBLIC_SITE_URL) {
    console.warn('Analytics: Missing Umami or Plausible config')
    return null
  }

  let domain = ''
  try {
    domain = new URL(process.env.NEXT_PUBLIC_SITE_URL).hostname
  } catch (error) {
    console.error('Invalid NEXT_PUBLIC_SITE_URL:', process.env.NEXT_PUBLIC_SITE_URL)
    return null // Prevent loading with invalid domain
  }

  return (
    <>
      <Script
        async
        defer
        data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
        src={`https://umami.iocloudhost.net/script.js`}
        data-do-not-track={true}
      />
      <Script
        defer
        data-domain={domain}
        src={`${PLAUSIBLE_URL}/js/script.file-downloads.hash.outbound-links.pageview-props.js`}
      />
      <Script src="/scripts/plausible-init.js" />
    </>
  )
}
