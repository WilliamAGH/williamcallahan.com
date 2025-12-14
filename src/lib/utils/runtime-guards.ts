/**
 * Runtime Guards
 *
 * Utility functions to enforce strict separation between server and client code.
 * These functions will throw runtime errors when code is executed in the wrong context.
 */

import { useEffect, useState } from "react";

/**
 * @serverOnly
 * Throws an error if executed in a browser context.
 * Use this in server components or server-side code to prevent client usage.
 *
 * @param moduleName Optional name of the module for better error messages
 */
export function assertServerOnly(moduleName?: string): void {
  if (typeof window !== "undefined") {
    const message = moduleName
      ? `Module '${moduleName}' cannot be imported from a Client Component module.`
      : "This module cannot be imported from a Client Component module.";
    throw new Error(`${message} It should only be used from a Server Component or other server-side code.`);
  }
}

/**
 * @clientOnly
 * Throws an error if executed in a server context.
 * Use this for client-specific functionality that requires browser APIs.
 *
 * @param featureName Name of the feature requiring client context
 */
export function assertClientOnly(featureName: string): void {
  if (typeof window === "undefined") {
    throw new Error(
      `'${featureName}' can only be used in client components. Add 'use client' directive or move to a .client.tsx file.`,
    );
  }
}

/**
 * @clientHook
 * React hook that returns whether the component is mounted on the client.
 * Useful for conditional rendering of browser-dependent features.
 *
 * @returns boolean indicating if code is running on the client
 */
export function useIsClient(): boolean {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  return isClient;
}

/**
 * @safeClientOnly
 * Safely executes a function only in the client context.
 * Returns a fallback value when executed on the server.
 *
 * @param fn Function to execute on the client
 * @param fallback Fallback value for server execution
 * @returns Result of fn() on the client, or fallback on the server
 */
export function safeClientOnly<T>(fn: () => T, fallback: T): T {
  if (typeof window === "undefined") {
    return fallback;
  }
  return fn();
}
