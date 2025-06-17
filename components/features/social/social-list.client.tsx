"use client";

/**
 * @file Social List Client Component
 * @module components/features/social/social-list.client
 *
 * @description
 * Client component that renders the list of social media profile cards.
 */

import { socialLinks } from "@/components/ui/social-icons/social-links";
import { useEffect, useState } from "react";
import { SocialCardClient } from "./social-card.client";

/**
 * SocialListClient Component
 *
 * Renders a list of social media cards with hydration safety
 */
export function SocialListClient() {
  const [mounted, setMounted] = useState(false);

  // Set up mounted state with delay to prevent hydration issues
  useEffect(() => {
    const timer = setTimeout(() => {
      setMounted(true);
    }, 20);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="p-6 sm:p-4">
      <div className="prose dark:prose-invert max-w-none mb-8 text-sm sm:text-base">
        <p>
          Here are some of the places I can be found online. I share content about technology,
          startups, investing, AI, LLMs,and software engineering.
        </p>
      </div>

      {/* Social Media Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
        {mounted
          ? // Only render actual cards when mounted to prevent hydration mismatch
            socialLinks.map((social) => (
              <div key={social.href} className="h-full">
                <SocialCardClient social={social} />
              </div>
            ))
          : // Render skeleton placeholders during server-side rendering
            ["skeleton-1", "skeleton-2", "skeleton-3", "skeleton-4", "skeleton-5"].map((id) => (
              <div
                key={id}
                className="relative flex flex-col bg-white/50 dark:bg-gray-800/50 backdrop-blur-lg ring-0 rounded-3xl overflow-hidden shadow-xl h-full"
              />
            ))}
      </div>
    </div>
  );
}
