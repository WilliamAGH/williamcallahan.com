/**
 * Social Media Links Configuration
 */

import { Github, Linkedin } from 'lucide-react';
import { X } from './x-icon';
import { Discord } from './discord-icon';
import type { SocialLink } from '@/types/social';

export const socialLinks: SocialLink[] = [
  { 
    icon: X, 
    href: 'https://x.com/williamcallahan',
    label: 'X (formerly Twitter)'
  },
  { 
    icon: Linkedin, 
    href: 'https://linkedin.com/in/williamacallahan',
    label: 'LinkedIn'
  },
  { 
    icon: Github, 
    href: 'https://github.com/williamagh',
    label: 'GitHub'
  },
  { 
    icon: Discord, 
    href: 'https://discord.com/users/WilliamDscord',
    label: 'Discord'
  }
];