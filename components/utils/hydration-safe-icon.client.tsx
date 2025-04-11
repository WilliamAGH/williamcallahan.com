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
 * caused by browser extensions modifying SVGs before hydration.
 * It achieves this by only rendering the icon on the client-side.
 */
export function HydrationSafeIcon({ icon: IconComponent, size = 24, className = '' }: HydrationSafeIconProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Only render the icon component on the client after mount
  if (!isMounted) {
    // Render a placeholder or null on the server and initial client render
    // A simple span matching size might be good to prevent layout shifts
    return <span style={{ width: size, height: size, display: 'inline-block' }} className={className} />;
    // Alternatively, return null if layout shift isn't a concern:
    // return null;
  }

  // Client-side: Render the actual icon
  // No need for suppressHydrationWarning here as it's client-only render
  return (
    <IconComponent
      size={size}
      className={className}
    />
  );
}
