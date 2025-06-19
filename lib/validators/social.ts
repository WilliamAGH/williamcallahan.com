/**
 * Social Data Validator
 *
 * SCOPE: Zod validation schemas for social link data structures.
 */
import { z } from "zod";

export const SocialLinkSchema = z.object({
  platform: z.string().min(1, "Platform name cannot be empty."),
  url: z.string().url("Invalid URL format."),
  href: z.string().url("Invalid URL format."),
  label: z.string().min(1, "Label cannot be empty."),
  icon: z.any().optional(), // for React components
  emphasized: z.boolean().optional(),
});

export const SocialLinksSchema = z.array(SocialLinkSchema);
