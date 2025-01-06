// components/analytics/UmamiAnalytics.tsx

/**
 * Umami Analytics Component
 *
 * Implements Umami web analytics tracking for the application. This component should be
 * placed in the root layout to enable site-wide analytics tracking.
 *
 * Features:
 * - Respects Do Not Track browser settings (enabled by default)
 * - Loads asynchronously to prevent blocking page rendering
 * - Handles missing configuration gracefully
 * - Uses environment variables for configuration
 *
 * Required environment variables:
 * - NEXT_PUBLIC_UMAMI_WEBSITE_ID: Your Umami website ID
 * - NEXT_PUBLIC_UMAMI_URL: URL of your Umami instance
 *
 * @see https://umami.is/docs/tracker-configuration
 */

'use client'

import Script from 'next/script'
import type { FC } from 'react'

interface UmamiAnalyticsProps {
  /**
   * Whether to respect Do Not Track browser settings
   * When true, analytics will not track users who have enabled Do Not Track
   * @default true
   */
  respectDoNotTrack?: boolean
}

/**
 * Renders the Umami Analytics tracking script
 *
 * @param {UmamiAnalyticsProps} props - Component properties
 * @param {boolean} [props.respectDoNotTrack=true] - Whether to respect Do Not Track settings
 * @returns {JSX.Element | null} The analytics script element or null if configuration is missing
 */
const UmamiAnalytics: FC<UmamiAnalyticsProps> = ({ respectDoNotTrack = true }) => {
  if (!process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || !process.env.NEXT_PUBLIC_UMAMI_URL) {
    console.warn('Umami Analytics configuration is missing')
    return null
  }

  return (
    <Script
      async
      defer
      strategy="afterInteractive"
      data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
      src={`${process.env.NEXT_PUBLIC_UMAMI_URL}/script.js`}
      data-do-not-track={respectDoNotTrack}
    />
  )
}

export default UmamiAnalytics