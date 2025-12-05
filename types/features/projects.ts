/**
 * Projects Feature Component Props
 *
 * SCOPE: Project portfolio component props and interfaces
 * USAGE: Use for project cards, galleries, portfolios, and related UI components
 * OVERLAP PREVENTION: Do NOT add generic UI props (use types/ui.ts)
 * DO NOT add other feature domains (use separate feature files)
 *
 * DRY PRINCIPLE: When creating component props, prefer extending/reusing types from
 * the core domain model (types/project.ts) rather than recreating similar structures.
 * Example: Use `project: Project` instead of redefining project properties inline.
 *
 * @see types/project.ts for project domain models and data types
 * @see types/ui.ts for generic UI component props
 */

import type { Project } from "../project";

// Use base component props
export type ProjectCardProps = import("../ui").BaseComponentProps & {
  project: Project;
  showTechnologies?: boolean;
  /** @deprecated Use `preload` instead (Next.js 16) */
  isPriority?: boolean;
  /** Preload the image in the document head (Next.js 16+) */
  preload?: boolean;
};

// Type extension
export type ProjectCardClientProps = ProjectCardProps & {
  interactive?: boolean;
  onClick?: (project: Project) => void;
};

// Type extension
export type ProjectCardServerProps = ProjectCardProps & {
  serverConfig?: {
    optimizeImages?: boolean;
    lazyLoad?: boolean;
  };
};

// Use base component props
export type ProjectsListProps = import("../ui").BaseComponentProps & {
  projects: Project[];
  columns?: number;
};

// Type extension with partial pagination
export type ProjectsListServerProps = ProjectsListProps & {
  pagination?: Partial<import("../component-types").PaginationProps>;
};

// Use generic WindowProps
export type ProjectsWindowProps = import("../component-types").WindowProps<{ projects: Project[] }>;

// Extend window props
export type ProjectsWindowClientProps = ProjectsWindowProps & {
  interactive?: boolean;
  onClose?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
};
