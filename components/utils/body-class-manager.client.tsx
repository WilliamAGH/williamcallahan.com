"use client";

import { useSafeWindowRegistry } from "@/lib/context/global-window-registry-context.client";
import { useEffect, useState } from "react";

/**
 * BodyClassManager Component
 *
 * This client component is solely responsible for managing body classes
 * based on the global window states (maximized, minimized).
 * It isolates this side effect from the main context provider to improve HMR stability.
 */
export function BodyClassManager() {
  const { windows } = useSafeWindowRegistry();
  const [isMounted, setIsMounted] = useState(false);

  // Track mount status to avoid SSR issues with direct DOM manipulation
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Effect to manage body classes based on window states
  useEffect(() => {
    if (!isMounted) {
      return;
    }

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
      // Check isMounted again in cleanup in case of fast unmounts
      if (isMounted) {
        document.body.classList.remove("window-maximized");
        document.body.classList.remove("window-minimized");
      }
    };
  }, [windows, isMounted]); // Depend on windows state and mount status

  // This component doesn't render anything itself
  return null;
}
