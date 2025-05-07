/**
 * Component Type Definitions
 *
 * This file contains type definitions that help enforce the separation
 * between server and client components.
 */

import type { ReactNode } from 'react';

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
