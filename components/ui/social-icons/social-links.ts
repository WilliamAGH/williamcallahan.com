/**
 * Social Media Links Configuration
 */

import { X } from './x-icon';
import { Discord } from './discord-icon';
import { Bluesky } from './bluesky-icon';
import { LinkedIn } from './linkedin-icon';
import { GitHub } from './github-icon';
import { socialLinksSchema, type SocialLink } from '@/types/social';

// Define the social links data - Reordered X to be after GitHub
const socialLinksData = [
  {
    icon: GitHub,
    href: 'https://github.com/williamagh',
    label: 'GitHub',
    emphasized: true
  },
  {
    icon: X,
    href: 'https://x.com/williamcallahan',
    label: 'X (Twitter)',
    emphasized: true
  },
  {
    icon: Discord,
    href: 'https://discord.com/users/WilliamDscord',
    label: 'Discord'
  },
  {
    icon: LinkedIn,
    href: 'https://linkedin.com/in/williamacallahan',
    label: 'LinkedIn'
  },
  {
    icon: Bluesky,
    href: 'https://bsky.app/profile/williamcallahan.com',
    label: 'Bluesky'
  }
];

// Runtime validation ensures data meets expected format
export const socialLinks: SocialLink[] = socialLinksSchema.parse(socialLinksData);