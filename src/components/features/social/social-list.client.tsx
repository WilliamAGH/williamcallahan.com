"use client";

/**
 * @file Social List Client Component
 * @module components/features/social/social-list.client
 *
 * @description
 * Client component that renders the list of social media profile cards.
 */

import { socialLinks } from "@/components/ui/social-icons/social-links";
import { SocialCardClient } from "./social-card.client";

/**
 * SocialListClient Component
 *
 * Renders a list of social media cards with hydration safety
 */
export function SocialListClient() {
  return (
    <div className="p-6 sm:p-4">
      <section>
        <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-white">
          Social Media Profiles
        </h2>
        <div className="prose dark:prose-invert max-w-none mb-8 text-sm sm:text-base">
          <p>
            Here are some of the places I can be found online. I share content about technology,
            startups, investing, AI, LLMs, and software engineering.
          </p>
        </div>

        {/* Social Media Cards */}
        <div className="grid auto-rows-[1fr] gap-6 sm:grid-cols-[repeat(auto-fit,minmax(min(330px,100%),1fr))] mt-8">
          {socialLinks.map((social) => (
            <div key={social.href} className="h-full">
              <SocialCardClient social={social} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
