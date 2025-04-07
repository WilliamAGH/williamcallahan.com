/**
 * Utility function to ensure a module is only loaded on the server.
 * Throws an error if called in a client-side (browser) environment.
 *
 * @param moduleName - Optional name of the module performing the check for clearer error messages.
 */
export function assertServerOnly(moduleName?: string): void {
  if (typeof window !== 'undefined') {
    const message = moduleName
      ? `Module '${moduleName}' cannot be imported from a Client Component module.`
      : "This module cannot be imported from a Client Component module.";
    throw new Error(
      `${message} It should only be used from a Server Component or other server-side code.`
    );
  }
}