"use client";

import Image from 'next/image';
import { useState, useEffect } from 'react';

/**
 * Profile image component that avoids hydration mismatches by
 * only rendering the image on the client side after mount
 */
export function ProfileImage() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Use a consistent aspect ratio for the container
  return (
    <div className="relative aspect-square w-full sm:w-64 rounded-full overflow-hidden">
      {isMounted ? (
        <Image
          src="/images/william-callahan-san-francisco.png"
          alt="William Callahan in San Francisco"
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 768px) 320px, 256px"
          className="object-cover"
          priority
        />
      ) : (
        // Placeholder while loading
        <div className="absolute inset-0 bg-gray-200 dark:bg-gray-700 animate-pulse" />
      )}
    </div>
  );
}