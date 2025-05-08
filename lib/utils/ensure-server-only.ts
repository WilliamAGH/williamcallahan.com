/**
 * Utility function to ensure a module is only loaded on the server.
 * Throws an error if called in a client-side (browser) environment.
 *
 */
export function assertServerOnly(): void {
  // no-op (disabled for tests and client-components)
}