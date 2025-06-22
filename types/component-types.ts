/**
 * Component Architectural Type Definitions
 *
 * SCOPE: Component architecture patterns and server/client separation
 *
 * This file contains ONLY architectural type definitions that help enforce
 * the separation between server and client components. It defines component
 * patterns and architectural boundaries.
 *
 * DO NOT ADD: Specific component props interfaces (use types/ui.ts instead)
 * DO ADD: Component pattern types, architectural helpers, component classifications
 *
 * @see types/ui.ts for specific component props interfaces
 * @see types/features.ts for feature-specific component props
 */

import type { ReactNode } from "react";
import type { BaseComponentProps } from "./ui";

/**
 * @serverComponent
 * Type definition for server components.
 * These components can only be used in server contexts and
 * should never include 'use client' directives.
 */
export type ServerComponent<P = Record<string, unknown>> = React.FC<P> & {
  /**
   * Server components should never have 'use client' directive.
   * This property is for type checking only and does not exist at runtime.
   */
  readonly __SERVER_COMPONENT__: true;
};

/**
 * @clientComponent
 * Type definition for client components.
 * These components must include 'use client' directive and
 * can use browser APIs and React hooks.
 */
export type ClientComponent<P = Record<string, unknown>> = React.FC<P> & {
  /**
   * Client components must include 'use client' directive.
   * This property is for type checking only and does not exist at runtime.
   */
  readonly __CLIENT_COMPONENT__: true;
};

/**
 * @sharedComponent
 * Type definition for components that can work in both server and client contexts.
 * These are typically pure presentational components with no side effects.
 */
export type SharedComponent<P = Record<string, unknown>> = React.FC<P>;

/**
 * @clientBoundary
 * Type helper for creating client boundary components that accept server-rendered content.
 * Use this for components that wrap server content with client interactivity.
 */
export interface ClientBoundaryProps {
  /**
   * Server-rendered content to be wrapped by the client component.
   */
  children: ReactNode;
}

/**
 * Helper type for React.FC with explicit children
 */
export type FCWithChildren<P = Record<string, unknown>> = React.FC<P & { children: ReactNode }>;

// BaseComponentProps is now imported from types/ui
// to avoid duplication

/**
 * Props for components that can be in loading states
 */
export interface LoadableComponentProps {
  /** Whether the component is in a loading state */
  loading?: boolean;
  /** Custom loading component */
  loadingComponent?: ReactNode;
}

/**
 * Props for components that can have error states
 */
export interface ErrorableComponentProps {
  /** Error state */
  error?: Error | string | null;
  /** Custom error component */
  errorComponent?: ReactNode;
  /** Error recovery callback */
  onErrorRetry?: () => void;
}

/**
 * Combined props for components that can be in loading or error states
 */
export interface AsyncComponentProps extends LoadableComponentProps, ErrorableComponentProps {
  /** Whether the component has successfully loaded */
  ready?: boolean;
}

/**
 * Generic window component props
 */
export interface WindowProps<T = unknown> extends BaseComponentProps {
  /** Window title */
  title?: string;
  /** Window active state */
  isActive?: boolean;
  /** Window-specific data */
  data?: T;
  /** Child content */
  children?: ReactNode;
  /** Optional slug used for display in window title bar */
  titleSlug?: string;
  /** Explicit window title overriding generic title (used in bookmarks window) */
  windowTitle?: string;
  /** Explicit unique window identifier */
  windowId?: string;
}

/**
 * Generic pagination props
 */
export interface PaginationProps {
  /** Current page number */
  currentPage?: number;
  /** Total number of pages */
  totalPages?: number;
  /** Items per page */
  itemsPerPage?: number;
  /** Total item count */
  totalCount?: number;
}

/**
 * Generic filter props
 */
export interface FilterProps {
  /** Show filter controls */
  showFilterBar?: boolean;
  /** Initial filter value */
  initialTag?: string;
  /** Active filter */
  activeFilter?: string;
}

/**
 * Props for components that can be conditionally rendered
 */
export interface ConditionalComponentProps {
  /** Whether the component should be rendered */
  show?: boolean;
  /** Fallback component when not shown */
  fallback?: ReactNode;
}

/**
 * Props for components that support theming
 */
export interface ThemedComponentProps {
  /** Theme variant */
  theme?: "light" | "dark" | "system";
  /** Custom theme properties */
  themeProps?: Record<string, unknown>;
}

/**
 * Props for interactive components
 */
export interface InteractiveComponentProps {
  /** Whether the component is disabled */
  disabled?: boolean;
  /** Whether the component is in a focused state */
  focused?: boolean;
  /** Whether the component is in an active state */
  active?: boolean;
}

/**
 * Generic component wrapper type for HOCs
 */
export type ComponentWrapper<P = Record<string, never>> = <T extends Record<string, unknown>>(
  Component: React.ComponentType<T>,
) => React.ComponentType<T & P>;

/**
 * Type for component ref forwarding
 */
export type ForwardedComponent<T, P = Record<string, never>> = React.ForwardRefExoticComponent<
  React.PropsWithoutRef<P> & React.RefAttributes<T>
>;

/**
 * Props for components that support custom rendering
 */
export interface RenderPropComponentProps<T = unknown> {
  /** Custom render function */
  render?: (props: T) => ReactNode;
  /** Alternative children render function */
  children?: ReactNode | ((props: T) => ReactNode);
}

/**
 * Props for polymorphic components that can render as different elements
 */
export interface PolymorphicComponentProps<T extends keyof React.JSX.IntrinsicElements = "div"> {
  /** Element type to render as */
  as?: T;
}

/**
 * Complete polymorphic component type
 */
export type PolymorphicComponent<
  T extends keyof React.JSX.IntrinsicElements = "div",
  P = Record<string, never>,
> = React.ComponentType<P & PolymorphicComponentProps<T> & React.JSX.IntrinsicElements[T]>;
