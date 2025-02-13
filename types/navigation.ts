/**
 * Navigation link definition
 * @interface NavigationLink
 * @property {string} name - Display name of the navigation link
 * @property {string} path - URL path for the navigation link
 */
export interface NavigationLink {
  name: string;
  path: string;
}

/**
 * Navigation menu states
 * Represents all possible states of the mobile navigation menu
 * @enum {string}
 */
export type NavigationMenuState = 'closed' | 'opening' | 'open' | 'closing';

export interface NavigationLinkProps extends NavigationLink {
  currentPath: string;
  className?: string;
  onClick?: () => void;
  role?: string;
  'aria-label'?: string;
}
