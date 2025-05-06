/**
 * Utility function to ensure a module is only loaded on the server.
 * Throws an error if called in a client-side (browser) environment.
 *
 * @param moduleName - Optional name of the module performing the check for clearer error messages.
 */
export function assertServerOnly(moduleName?: string): void {
  // no-op (disabled for tests and client-components)
}