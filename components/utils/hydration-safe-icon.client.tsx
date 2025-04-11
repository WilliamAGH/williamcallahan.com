"use client";

import React, { useState, useEffect } from 'react';
import type { LucideIcon } from 'lucide-react';

interface HydrationSafeIconProps {
  icon: LucideIcon; // Keep the prop type as LucideIcon for clarity
  size?: number;
  className?: string;
}

/**
 * Wrapper component for Lucide icons that prevents hydration mismatches
 * by using strict client-side rendering.
 */
export function HydrationSafeIcon({ icon: IconComponent, size = 24, className = '' }: HydrationSafeIconProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Before client-side hydration completes, render a placeholder with exact same dimensions
  if (!isMounted) {
    return (
      <span
        style={{
          width: `${size}px`,
          height: `${size}px`,
          display: 'inline-block'
        }}
        className={className}
      />
    );
  }

  // Only render the actual icon on the client after hydration
  return <IconComponent size={size} className={className} />;
}
