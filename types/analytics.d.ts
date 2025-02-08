interface UmamiAnalytics {
  track: (event: string, data?: Record<string, any>) => void
}

interface PlausibleAnalytics {
  (event: string, options?: { props?: Record<string, any> }): void
}

declare global {
  interface Window {
    umami?: UmamiAnalytics
    plausible?: PlausibleAnalytics
  }
}