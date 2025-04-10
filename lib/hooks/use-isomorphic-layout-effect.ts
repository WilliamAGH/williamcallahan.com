/**
 * @file Isomorphic Layout Effect Hook
 * @module lib/hooks/use-isomorphic-layout-effect
 *
 * @description
 * Provides a way to safely use useLayoutEffect in SSR environments
 * by falling back to useEffect during server rendering.
 *
 * This prevents the React warning about useLayoutEffect doing nothing on the server
 * while still allowing components to use layout effects when running in the browser.
 *
 * @example
 * import { useIsomorphicLayoutEffect } from '@/hooks/use-isomorphic-layout-effect';
 *
 * function MyComponent() {
 *   // This will use useLayoutEffect on the client, but useEffect on the server
 *   useIsomorphicLayoutEffect(() => {
 *     // Perform DOM measurements or manipulations here
 *     const height = element.getBoundingClientRect().height;
 *     // Update state based on measurements
 *   }, [dependency]);
 *
 *   return <div>...</div>;
 * }
 *
 * @clientComponent - This is a client component utility and should only be used in client components
 */

import { useEffect, useLayoutEffect } from 'react';

/**
 * A hook that safely provides layout effects in all environments.
 * - Uses useLayoutEffect in the browser for synchronous DOM updates
 * - Falls back to useEffect on the server to avoid warning messages
 */
export const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;