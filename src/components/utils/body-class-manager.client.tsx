"use client";

import { useSafeWindowRegistry } from "@/lib/context/global-window-registry-context.client";
import { useEffect } from "react";

/**
 * BodyClassManager Component
 *
 * This client component is solely responsible for managing body classes
 * based on the global window states (maximized, minimized).
 * It isolates this side effect from the main context provider to improve HMR stability.
 */
export function BodyClassManager() {
  const { windows } = useSafeWindowRegistry();
  // Effect to manage body classes based on window states
  // Effects never run during SSR, so direct DOM manipulation is safe here
  useEffect(() => {
    // Check states separately
    const isAnyWindowMaximized = Object.values(windows).some((w) => w.state === "maximized");
    const isAnyWindowMinimized = Object.values(windows).some((w) => w.state === "minimized");

    // Manage maximized class
    if (isAnyWindowMaximized) {
      document.body.classList.add("window-maximized");
    } else {
      document.body.classList.remove("window-maximized");
    }

    // Manage minimized class
    if (isAnyWindowMinimized) {
      document.body.classList.add("window-minimized");
    } else {
      document.body.classList.remove("window-minimized");
    }

    // Cleanup MUST remove both potential classes on unmount or state change
    return () => {
      document.body.classList.remove("window-maximized");
      document.body.classList.remove("window-minimized");
    };
  }, [windows]);

  // This component doesn't render anything itself
  return null;
}
