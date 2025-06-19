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

/**
 * Project card component props
 * @usage - Individual project display cards
 */
export interface ProjectCardProps {
  /** Project data */
  project: Project;
  /** Whether to show technologies */
  showTechnologies?: boolean;
  /** Optional CSS classes */
  className?: string;
}

/**
 * Interactive project card component props
 * @usage - Client-side project cards with click handlers
 */
export interface ProjectCardClientProps extends ProjectCardProps {
  /** Whether card is interactive */
  interactive?: boolean;
  /** Click callback */
  onClick?: (project: Project) => void;
}

/**
 * Server-side project card component props
 * @usage - Server-rendered project cards with optimization options
 */
export interface ProjectCardServerProps extends ProjectCardProps {
  /** Server-side configuration */
  serverConfig?: {
    optimizeImages?: boolean;
    lazyLoad?: boolean;
  };
}

/**
 * Projects list component props
 * @usage - Grid/list displays of multiple projects
 */
export interface ProjectsListProps {
  /** Array of projects */
  projects: Project[];
  /** Grid layout columns */
  columns?: number;
  /** Optional CSS classes */
  className?: string;
}

/**
 * Server-side projects list component props
 * @usage - Server-rendered project lists with pagination
 */
export interface ProjectsListServerProps extends ProjectsListProps {
  /** Server-side pagination */
  pagination?: {
    currentPage: number;
    totalPages: number;
  };
}

/**
 * Projects window component props
 * @usage - Projects displayed in window-like UI
 */
export interface ProjectsWindowProps {
  /** Projects to display */
  projects: Project[];
  /** Window title */
  title?: string;
  /** Whether window is active */
  isActive?: boolean;
  /** Optional CSS classes */
  className?: string;
}

/**
 * Interactive projects window component props
 * @usage - Client-side project windows with window controls
 */
export interface ProjectsWindowClientProps extends ProjectsWindowProps {
  /** Whether window is interactive */
  interactive?: boolean;
  /** Window state callbacks */
  onClose?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
}
