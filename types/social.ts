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
import { SOCIAL_PLATFORMS } from "@/lib/opengraph/constants";

/**
 * Represents a single social media link.
 * Renamed from SocialIcon to avoid collision with the UI component type.
 */
export type SocialLink = z.infer<typeof SocialLinkSchema>;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[keyof typeof SOCIAL_PLATFORMS];

// Re-export for backward compatibility
export { SOCIAL_PLATFORMS };
