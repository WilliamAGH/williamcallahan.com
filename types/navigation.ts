export interface NavigationLink {
  name: string;
  path: string;
}

export interface NavigationLinkProps extends NavigationLink {
  currentPath: string;
  className?: string;
  onClick?: () => void;
}