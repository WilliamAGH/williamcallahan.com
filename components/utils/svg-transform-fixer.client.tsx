"use client";

import { useEffect, useRef } from 'react';
import { processSvgTransforms } from '@/lib/utils/svg-transform-fix';

/**
 * SvgTransformFixer Component
 *
 * A utility component that automatically fixes SVG transform attributes
 * throughout the document. It attaches to the document body and fixes
 * all SVGs on mount and when new ones are added.
 */
export function SvgTransformFixer() {
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;

    // Fix all SVGs in the document
    const fixAllSvgs = () => {
      const svgs = document.querySelectorAll('svg[transform]');
      svgs.forEach(svg => {
        processSvgTransforms(svg as SVGElement);
      });
    };

    // Fix SVGs immediately
    fixAllSvgs();

    // Set up a MutationObserver to fix SVGs added dynamically
    const observer = new MutationObserver(mutations => {
      let hasSvgs = false;

      // Check if any mutations involve SVGs
      mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(node => {
            if (node instanceof SVGElement ||
               (node.nodeType === Node.ELEMENT_NODE && (node as Element).querySelectorAll('svg').length > 0)) {
              hasSvgs = true;
            }
          });
        }
      });

      // Only run the fix if we found SVGs
      if (hasSvgs) {
        fixAllSvgs();
      }
    });

    // Start observing
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Clean up
    return () => {
      observer.disconnect();
    };
  }, []);

  // This component doesn't render anything
  return null;
}