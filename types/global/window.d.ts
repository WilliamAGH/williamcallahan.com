// Define the structure for the Clicky analytics object on the window
interface ClickyAnalytics {
  pageview: (path: string) => void;
  // Add other Clicky methods if you use them, e.g.:
  // log: (href: string, title?: string, type?: string) => void;
  // goal: (goalId: string | number, revenue?: number) => void;
}

// Extend the global Window interface to include clicky
declare global {
  interface Window {
    clicky?: ClickyAnalytics;
    // You can also declare other global analytics objects here if needed
    // umami?: UmamiTracker; // If umami is directly on window and not namespaced
    // plausible?: PlausibleTracker; // If plausible is directly on window
  }
}

// Export an empty object to make this a module file if required by tsconfig, though for .d.ts it's often not needed.
// If 'isolatedModules' is true, this might be necessary.
export {};