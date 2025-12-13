/**
 * Navigation Configuration
 *
 * Defines the primary navigation structure for the application.
 * CV serves as the parent for Experience and Education, which appear
 * as nested sub-items in a dropdown (desktop) or expandable section (mobile).
 *
 * @module components/ui/navigation/navigation-links
 * Shared between server and client components.
 */

import type { NavigationLink } from "@/types/navigation";

// Bookshelf (/books) is being incrementally added to the site.
// The page routes are live and indexed in sitemap.xml with dynamic book locations.
// Navigation exposure will be enabled after further production testing is complete.
const isProduction = process.env.NODE_ENV === "production";

export const navigationLinks: NavigationLink[] = [
  { name: "Home", path: "/" },
  {
    name: "CV",
    path: "/cv",
    children: [
      { name: "Experience", path: "/experience" },
      { name: "Education", path: "/education" },
    ],
  },
  { name: "Projects", path: "/projects" },
  { name: "Bookmarks", path: "/bookmarks" },
  { name: "Investments", path: "/investments" },
  // Contact tab is shown before Blog, but only on XL viewports and above
  {
    name: "Contact",
    path: "/contact",
    responsive: { hideBelow: "xl" },
  },
  // Conditionally show Bookshelf - hidden in production until further testing complete
  ...(isProduction ? [] : [{ name: "Bookshelf", path: "/books" }]),
  { name: "Blog", path: "/blog" },
];
