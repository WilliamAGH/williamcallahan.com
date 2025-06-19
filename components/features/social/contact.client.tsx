"use client";

/**
 * Social Contact Component
 * Using window architecture similar to projects page
 */

import { socialLinks } from "@/components/ui/social-icons/social-links";
import { useEffect, useState } from "react";
import { SocialCardEffects } from "./social-card-effects.client";
import { SocialWindow } from "./social-window.client";

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
      {mounted && <SocialWindow socialLinks={socialLinks} />}
    </div>
  );
}
