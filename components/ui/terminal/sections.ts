/**
 * Terminal Navigation Sections
 *
 * Defines available navigation paths for the terminal interface.
 */

export const sections = {
  home: "/",
  investments: "/investments",
  experience: "/experience",
  education: "/education",
  skills: "/skills",
  blog: "/blog",
  bookmarks: "/bookmarks",
  bookmark: "/bookmarks", // allows for singular and plural form
  aventure: "/experience#aventure",
  tsbank: "/experience#tsbank",
  seekinvest: "/experience#seekinvest",
  "callahan-financial": "/experience#callahan-financial",
  "mutual-first": "/experience#mutual-first",
  morningstar: "/experience#morningstar",
} as const;

export type SectionKey = keyof typeof sections;
