/**
 * Social Media Types
 *
 * Type definitions for social media links and icons with runtime validation.
 */

import { z } from 'zod';

// Runtime validation schema
export const socialLinkSchema = z.object({
  href: z.string().url(),
  label: z.string(),
  // Can't strongly type the icon function itself with Zod
  icon: z.any(),
  emphasized: z.boolean().optional()
});

// For arrays of social links
export const socialLinksSchema = z.array(socialLinkSchema);

// TypeScript types derived from Zod schema for better consistency
export type SocialIconProps = z.infer<typeof socialLinkSchema>;
export type SocialLink = SocialIconProps;
