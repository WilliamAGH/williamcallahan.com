"use client";

import { processSvgTransforms } from "@/lib/image-handling/svg-transform-fix";
import { useEffect, useRef, type RefObject } from "react";

/**
 * A React hook that fixes SVG transform attributes in a container element
 *
 * @param options - Hook options
 * @param options.rootRef - Optional ref to the root element (creates one if not provided)
 * @param options.selector - CSS selector to find SVGs (defaults to 'svg')
 * @returns - Ref object to attach to a component
 *
 * Example:
 * ```tsx
 * function SvgContainer() {
 *   const containerRef = useFixSvgTransforms();
 *
 *   return (
 *     <div ref={containerRef}>
 *       <svg>...</svg>
 *     </div>
 *   );
 * }
 * ```
 */
export function useFixSvgTransforms<T extends HTMLElement = HTMLDivElement>(
  options: { rootRef?: RefObject<T | null>; selector?: string } = {},
): RefObject<T | null> {
  const { rootRef, selector = "svg" } = options;
  const internalRef = useRef<T>(null);
  const ref = rootRef || internalRef;

  useEffect(() => {
    if (!ref.current) return;

    // Fix all SVGs in the container
    const svgs = ref.current.querySelectorAll(selector);
    for (const svg of svgs) {
      if (svg instanceof SVGElement) {
        processSvgTransforms(svg);
      }
    }

    // Set up a MutationObserver to fix SVGs added dynamically
    const observer = new MutationObserver((mutations) => {
      // Check if any mutations involve SVGs
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          for (const node of mutation.addedNodes) {
            // If the node itself is an SVG
            if (node instanceof SVGElement) {
              processSvgTransforms(node);
            }

            // Check for SVGs inside the added node
            if (node.nodeType === Node.ELEMENT_NODE) {
              const svgsInNode = (node as Element).querySelectorAll(selector);
              if (svgsInNode.length > 0) {
                for (const svg of svgsInNode) {
                  if (svg instanceof SVGElement) {
                    processSvgTransforms(svg);
                  }
                }
              }
            }
          }
        }
      }
    });

    // Start observing the container
    observer.observe(ref.current, {
      childList: true,
      subtree: true,
    });

    // Clean up
    return () => {
      observer.disconnect();
    };
  }, [ref, selector]);

  return ref;
}
