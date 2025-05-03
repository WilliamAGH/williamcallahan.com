"use client";

/**
 * Social Contact Component
 * Using window architecture similar to projects page
 */

import { useState, useEffect } from 'react';
import { SocialWindow } from './social-window.client';
import { SocialCardEffects } from './social-card-effects.client';

export function SocialContactClient() {
  const [mounted, setMounted] = useState(false);

  // Set up mounted state with delay to prevent hydration issues
  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
    }, 20);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="max-w-5xl mx-auto" suppressHydrationWarning>
      {/* Apply social network brand effects on hover */}
      <SocialCardEffects />

      {/* Render window only when mounted */}
      {mounted && (
        <SocialWindow>
          <div className="relative">
            {/* Additional UI components could be placed here in the future */}
          </div>
        </SocialWindow>
      )}
    </div>
  );
}