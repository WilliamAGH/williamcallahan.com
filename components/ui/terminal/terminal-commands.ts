/**
 * Terminal Navigation Commands
 * 
 * Maps terminal commands to their corresponding routes in the application.
 * This allows users to navigate the site using the terminal interface.
 */

export const terminalCommands = {
  home: '/',
  investments: '/investments',
  experience: '/experience',
  skills: '/skills',
  blog: '/blog',
  aventure: '/experience#aventure',
  tsbank: '/experience#tsbank',
  seekinvest: '/experience#seekinvest',
  'callahan-financial': '/experience#callahan-financial',
  'mutual-first': '/experience#mutual-first',
  morningstar: '/experience#morningstar'
} as const;