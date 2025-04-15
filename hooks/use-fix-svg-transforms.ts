"use client";

import { useEffect, useRef, RefObject } from 'react';
import { processSvgTransforms } from '@/lib/utils/svg-transform-fix';

/**
 * Hook to automatically fix SVG transform attributes in a component
 *
 * @param options - Hook options
 * @param options.rootRef - Optional ref to the root element (creates one if not provided)
 * @param options.selector - CSS selector to find SVGs (defaults to 'svg')
 * @returns - Ref object to attach to a component
 */
export function useFixSvgTransforms<T extends HTMLElement = HTMLDivElement>(
  options: {
    rootRef?: RefObject<T>;
    selector?: string;
  } = {}
): RefObject<T> {
  const { rootRef, selector = 'svg' } = options;
  const internalRef = useRef<T>(null);
  const ref = rootRef || internalRef;

  useEffect(() => {
    if (!ref.current) return;

    // Initial fix for all SVGs
    const svgs = ref.current.querySelectorAll(selector);
    svgs.forEach(svg => {
      if (svg instanceof SVGElement) {
        processSvgTransforms(svg);
      }
    });

    // Set up a MutationObserver to fix dynamically added SVGs
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            // If the node itself is an SVG
            if (node instanceof SVGElement) {
              processSvgTransforms(node);
            }

            // Check for SVGs inside the added node
            if (node.nodeType === Node.ELEMENT_NODE) {
              const svgsInNode = (node as Element).querySelectorAll(selector);
              svgsInNode.forEach(svg => {
                if (svg instanceof SVGElement) {
                  processSvgTransforms(svg);
                }
              });
            }
          });
        }
      });
    });

    // Start observing with configuration
    observer.observe(ref.current, {
      childList: true,
      subtree: true
    });

    // Cleanup observer on unmount
    return () => {
      observer.disconnect();
    };
  }, [ref, selector]);

  return ref;
}