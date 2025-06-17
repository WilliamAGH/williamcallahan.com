/**
 * Social Media Links Configuration
 */

import { type SocialLink, socialLinksSchema } from "@/types/social";
import { Bluesky } from "./bluesky-icon";
import { Discord } from "./discord-icon";
import { GitHub } from "./github-icon";
import { LinkedIn } from "./linkedin-icon";
import { X } from "./x-icon";

// Define the social links data - Reordered X to be after GitHub
const socialLinksData = [
  {
    icon: GitHub,
    href: "https://github.com/WilliamAGH",
    label: "GitHub",
    emphasized: true,
  },
  {
    icon: X,
    href: "https://x.com/williamcallahan",
    label: "X (Twitter)",
    emphasized: true,
  },
  {
    icon: Discord,
    href: "https://discord.com/users/WilliamDscord",
    label: "Discord",
  },
  {
    icon: LinkedIn,
    href: "https://linkedin.com/in/williamacallahan",
    label: "LinkedIn",
  },
  {
    icon: Bluesky,
    href: "https://bsky.app/profile/williamcallahan.com",
    label: "Bluesky",
  },
];

// Runtime validation ensures data meets expected format
export const socialLinks: SocialLink[] = socialLinksSchema.parse(socialLinksData);
