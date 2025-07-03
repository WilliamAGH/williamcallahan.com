"use client";

/**
 * Social Contact Component - Optimized
 * Eliminated artificial delays and simplified architecture
 */

import { socialLinks } from "@/components/ui/social-icons/social-links";
import { SocialCardEffects } from "./social-card-effects.client";
import { SocialWindow } from "./social-window.client";

export function SocialContactClient() {
  return (
    <div className="max-w-5xl mx-auto" suppressHydrationWarning>
      {/* Apply social network brand effects on hover */}
      <SocialCardEffects />
      {/* Render window immediately – hydration mismatches are negligible and suppressed */}
      <SocialWindow data={{ socialLinks }} />
    </div>
  );
}
