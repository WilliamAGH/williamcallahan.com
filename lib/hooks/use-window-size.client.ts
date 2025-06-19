"use client";

import { useEffect, useState } from "react";
import type { UseWindowSizeResult } from "@/types/lib";

/**
 * A hook to get the current window dimensions
 * @returns The current window width and height
 */
export function useWindowSize(): UseWindowSizeResult {
  // Initialize state with undefined so server and client renders match
  const [windowSize, setWindowSize] = useState<UseWindowSizeResult>({
    width: undefined,
    height: undefined,
  });

  useEffect(() => {
    // Handler to call on window resize
    function handleResize() {
      // Set window width/height to state
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }

    // Add event listener
    window.addEventListener("resize", handleResize);

    // Call handler right away so state gets updated with initial window size
    handleResize();

    // Remove event listener on cleanup
    return () => window.removeEventListener("resize", handleResize);
  }, []); // Empty array ensures effect runs only on mount and unmount

  return windowSize;
}
