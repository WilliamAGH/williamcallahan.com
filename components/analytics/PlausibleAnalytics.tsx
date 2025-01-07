/**
 * Plausible Analytics Component
 *
 * Implements Plausible web analytics tracking for the application. This component should be
 * placed in the root layout to enable site-wide analytics tracking.
 *
 * Features:
 * - Loads asynchronously to prevent blocking page rendering
 * - Handles missing configuration gracefully
 * - Uses environment variables for configuration
 * - Supports custom events and outbound link tracking
 * - Includes file downloads, outbound links, and pageview props tracking
 *
 * Required environment variables:
 * - NEXT_PUBLIC_SITE_URL: Your site URL (domain will be extracted from this)
 *
 * @see https://plausible.io/docs
 */

'use client'

import Script from 'next/script'
import type { FC } from 'react'

const PLAUSIBLE_URL = 'https://plausible.callahan.cloud'

interface PlausibleAnalyticsProps {
  /**
   * Whether to enable outbound link tracking
   * @default true
   */
  outboundLinks?: boolean
  /**
   * Whether to enable file download tracking
   * @default true
   */
  fileDownloads?: boolean
}

type PlausibleArgs = [
  eventName: string,
  options?: {
    props?: Record<string, string | number | boolean>
    callback?: () => void
  }
]

declare global {
  interface Window {
    plausible: {
      (...args: PlausibleArgs): void
      q?: PlausibleArgs[]
    }
  }
}

/**
 * Extracts domain from URL by removing protocol and trailing slashes
 */
const extractDomain = (url: string): string => {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

/**
 * Renders the Plausible Analytics tracking script
 *
 * @param {PlausibleAnalyticsProps} props - Component properties
 * @returns {JSX.Element | null} The analytics script element or null if configuration is missing
 */
const PlausibleAnalytics: FC<PlausibleAnalyticsProps> = ({
  outboundLinks = true,
  fileDownloads = true,
}) => {
  if (!process.env.NEXT_PUBLIC_SITE_URL) {
    console.warn('Plausible Analytics configuration is missing')
    return null
  }

  const domain = extractDomain(process.env.NEXT_PUBLIC_SITE_URL)

  return (
    <>
      <Script
        defer
        strategy="afterInteractive"
        data-domain={domain}
        src={`${PLAUSIBLE_URL}/js/script.file-downloads.hash.outbound-links.pageview-props.js`}
      />
      <Script
        id="plausible-setup"
        strategy="afterInteractive"
      >
        {'window.plausible = window.plausible || function() { (window.plausible.q = window.plausible.q || []).push(arguments) }'}
      </Script>
    </>
  )
}

export default PlausibleAnalytics