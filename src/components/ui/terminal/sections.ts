/**
 * Terminal Navigation Sections
 *
 * Defines available navigation paths for the terminal interface.
 */

import type { SectionKey } from "@/types/ui/terminal";

export const sections: Record<SectionKey, string> = {
  home: "/",
  investments: "/investments",
  experience: "/experience",
  education: "/education",
  projects: "/projects",
  blog: "/blog",
  bookmarks: "/bookmarks",
  bookmark: "/bookmarks", // allows for singular and plural form
  books: "/books",
  thoughts: "/thoughts",
  aventure: "/experience#aventure",
  tsbank: "/experience#tsbank",
  seekinvest: "/experience#seekinvest",
  "callahan-financial": "/experience#callahan-financial",
  "mutual-first": "/experience#mutual-first",
  morningstar: "/experience#morningstar",
};
