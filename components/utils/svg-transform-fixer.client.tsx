"use client";

import { useEffect, useRef } from 'react';
import { processSvgTransforms } from '@/lib/utils/svg-transform-fix';

/**
 * SvgTransformFixer Component
 *
 * A utility component that automatically fixes SVG transform attributes
 * throughout the document. It attaches to the document body and fixes
 * all SVGs on mount and when new ones are added.
 *
 * USE THIS COMPONENT TO FIX SOCIAL ICONS AND OTHER SVG ELEMENTS IN YOUR APP
 *
 * Usage:
 * 1. Add this component once in your RootLayout
 * 2. All SVGs with transform attributes will be automatically fixed
 * 3. For SVGs that need special treatment, add data-transform-fix="true"
 *
 * Example usage in layout:
 *
 * ```tsx
 * // In your layout.tsx or similar parent component:
 * import { SvgTransformFixer } from '@/components/utils/svg-transform-fixer.client';
 *
 * export default function Layout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         <SvgTransformFixer />
 *         {children}
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
export function SvgTransformFixer() {
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;

    // Fix all SVGs in the document
    const fixAllSvgs = () => {
      // First, look for SVGs with transform attributes
      const svgs = document.querySelectorAll('svg[transform]');
      svgs.forEach(svg => {
        processSvgTransforms(svg as SVGElement);
      });

      // Also look for SVGs with the data-transform-fix attribute
      const fixTargets = document.querySelectorAll('svg[data-transform-fix="true"]');
      fixTargets.forEach(svg => {
        processSvgTransforms(svg as SVGElement);
      });

      // Look for containers that might need transformation for their children
      const containerTargets = document.querySelectorAll('[data-transform-fix-container="true"]');
      containerTargets.forEach(container => {
        const svgsInContainer = container.querySelectorAll('svg');
        svgsInContainer.forEach(svg => {
          processSvgTransforms(svg as SVGElement);
        });
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