export interface NavigationLink {
  name: string;
  path: string;
  responsive?: {
    hideBelow?: "sm" | "md" | "lg" | "xl" | "2xl";
    hideAbove?: "sm" | "md" | "lg" | "xl" | "2xl";
  };
}

export interface NavigationLinkProps extends NavigationLink {
  currentPath: string;
  className?: string;
  onClick?: () => void;
}
