/**
 * Navigation Configuration
 *
 * This file contains the configuration for the navigation links.
 * It is used to generate the navigation links for the application.
 *
 * @module components/ui/navigation/navigation-links
 * It is a shared component (server and client)
 */

import type { NavigationLink } from "@/types/navigation";

export const navigationLinks: NavigationLink[] = [
  { name: "Home", path: "/" },
  { name: "Experience", path: "/experience" },
  { name: "CV", path: "/cv" },
  { name: "Education", path: "/education" },
  { name: "Projects", path: "/projects" },
  { name: "Bookmarks", path: "/bookmarks" },
  { name: "Investments", path: "/investments" },
  // Contact tab is shown before Blog, but only on XL viewports and above
  {
    name: "Contact",
    path: "/contact",
    responsive: { hideBelow: "xl" },
  },
  { name: "Blog", path: "/blog" },
];
