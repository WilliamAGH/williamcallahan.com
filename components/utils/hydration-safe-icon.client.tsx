"use client";

import React, { useEffect, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';

interface HydrationSafeIconProps {
  icon: LucideIcon;
  size?: number;
  className?: string;
}

/**
 * Wrapper component for Lucide icons that protects against hydration mismatches
 * caused by browser extensions like Dark Reader.
 */
export function HydrationSafeIcon({ icon: Icon, size = 24, className = '' }: HydrationSafeIconProps) {
  // Render directly with suppressHydrationWarning to avoid mismatches
  return (
    <Icon
      size={size}
      className={className}
      suppressHydrationWarning
    />
  );
}
