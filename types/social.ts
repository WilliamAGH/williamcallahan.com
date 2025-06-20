/**
 * Social Media and Links Types
 *
 * SCOPE: Domain-specific types for social media links, profiles, and related data.
 * This file defines the shape of social data, not the UI components that display it.
 *
 * @see types/ui/social.ts for the UI component props (e.g., SocialIcon component)
 */
import type { z } from "zod";
import type { SocialLinkSchema } from "@/lib/validators/social";

/**
 * Social media platform constants.
 * Moved from lib/opengraph/constants.ts to break a circular dependency.
 * This is the single source of truth for social platform names.
 */
export const SOCIAL_PLATFORMS = {
  GITHUB: "GitHub",
  TWITTER: "Twitter",
  X: "X",
  LINKEDIN: "LinkedIn",
  DISCORD: "Discord",
  BLUESKY: "Bluesky",
} as const;

/**
 * Represents a single social media link.
 * Renamed from SocialIcon to avoid collision with the UI component type.
 */
export type SocialLink = z.infer<typeof SocialLinkSchema>;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[keyof typeof SOCIAL_PLATFORMS];
