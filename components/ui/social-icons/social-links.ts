/**
 * Social Media Links Configuration
 */

import { SocialLinksSchema } from "@/lib/validators/social";
import type { SocialLink } from "@/types/social";
import { Bluesky } from "./bluesky-icon";
import { Discord } from "./discord-icon";
import { GitHub } from "./github-icon";
import { LinkedIn } from "./linkedin-icon";
import { X } from "./x-icon";

// Define the social links data - Reordered X to be after GitHub
const socialLinksData = [
  {
    platform: "github",
    href: "https://github.com/WilliamAGH",
    label: "GitHub",
    icon: GitHub,
    emphasized: true,
  },
  {
    platform: "x",
    href: "https://x.com/williamcallahan",
    label: "X (Twitter)",
    icon: X,
    emphasized: true,
  },
  {
    platform: "discord",
    href: "https://discord.com/users/WilliamDscord",
    label: "Discord",
    icon: Discord,
  },
  {
    platform: "linkedin",
    href: "https://linkedin.com/in/williamacallahan",
    label: "LinkedIn",
    icon: LinkedIn,
  },
  {
    platform: "bluesky",
    href: "https://bsky.app/profile/williamcallahan.com",
    label: "Bluesky",
    icon: Bluesky,
  },
];

// Runtime validation ensures data meets expected format
export const socialLinks: SocialLink[] = SocialLinksSchema.parse(socialLinksData);
