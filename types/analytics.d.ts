interface UmamiAnalytics {
  track: (event: string, data?: Record<string, unknown>) => void
}

interface PlausibleAnalytics {
  (event: string, options?: { props?: Record<string, unknown> }): void
}

declare global {
  interface Window {
    umami?: UmamiAnalytics
    plausible?: PlausibleAnalytics
    clicky?: {
      pageview: (path: string) => void;
      // Add other Clicky methods if needed
    }
  }
}