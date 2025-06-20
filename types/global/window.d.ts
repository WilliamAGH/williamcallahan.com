// Needed for JSX namespace re-exports
import type * as React from "react";

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
    // Global analytics trackers
    /** Umami analytics tracker */
    umami?: { track: (eventName: string, data?: Record<string, unknown>) => void };
    /** Plausible analytics function */
    plausible?: (eventName: string, options?: { props?: Record<string, unknown> }) => void;
    /** Twitter widgets API */
    twttr?: {
      widgets?: {
        load: (element?: HTMLElement | null) => void;
      };
    };
  }

  // Fix for JSX namespace issues with @types/mdx and React 19
  // This provides the missing JSX namespace that some packages still reference
  namespace JSX {
    // Re-export React's JSX types to maintain compatibility
    type Element = React.JSX.Element;
    type IntrinsicElements = React.JSX.IntrinsicElements;
    type ElementClass = React.JSX.ElementClass;
    type ElementAttributesProperty = React.JSX.ElementAttributesProperty;
    type ElementChildrenAttribute = React.JSX.ElementChildrenAttribute;
    type LibraryManagedAttributes<C, P> = React.JSX.LibraryManagedAttributes<C, P>;
    type IntrinsicAttributes = React.JSX.IntrinsicAttributes;
    type IntrinsicClassAttributes<T> = React.JSX.IntrinsicClassAttributes<T>;
  }
}
