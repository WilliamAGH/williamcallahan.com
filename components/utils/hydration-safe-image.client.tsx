/**
 * Hydration Safe Image Component
 *
 * This component ensures that images are rendered consistently between server and client.
 * It removes any Dark Reader attributes and normalizes positioning values to prevent hydration mismatches.
 *
*/

"use client";

import { useEffect, useRef } from 'react';
import Image, { ImageProps } from 'next/image';

/**
 * Wrapper for Next.js Image component that prevents hydration mismatches
 * caused by style differences between server and client.
 */
export function HydrationSafeImage({ alt = "", ...rest }: ImageProps) { // Destructure alt with default, get rest of props
  const imgRef = useRef<HTMLImageElement>(null);

  // Clean up any attributes or styles that might cause hydration mismatches
  useEffect(() => {
    if (imgRef.current) {
      // Remove any Dark Reader attributes
      imgRef.current.removeAttribute('data-darkreader-inline-color');
      imgRef.current.removeAttribute('data-darkreader-inline-bgcolor');

      // Clean up style properties
      if (imgRef.current.style) {
        // Normalize positioning values to match server rendering
        if (imgRef.current.style.left === '0px') imgRef.current.style.left = '0';
        if (imgRef.current.style.top === '0px') imgRef.current.style.top = '0';
        if (imgRef.current.style.right === '0px') imgRef.current.style.right = '0';
        if (imgRef.current.style.bottom === '0px') imgRef.current.style.bottom = '0';

        // Remove Dark Reader style properties
        imgRef.current.style.removeProperty('--darkreader-inline-color');
        imgRef.current.style.removeProperty('--darkreader-inline-bgcolor');
      }
    }
  }, []);

  return (
    <div data-hydration-safe="true" suppressHydrationWarning>
      <Image
        alt={alt} // Use the destructured alt (either from props or default "")
        {...rest} // Spread the rest of the props
        ref={imgRef as any}
      />
    </div>
  );
}
