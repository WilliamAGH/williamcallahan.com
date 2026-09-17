/**
 * Run a Node script task against the repository's TypeScript database owners.
 *
 * Registers the tsx loader so `@/` imports inside src/ resolve, runs the task,
 * then closes the shared connection and unregisters the loader. Scripts stay
 * `.node.mjs` under Node (CLAUDE.md [RT1]); the task does the mutation- or
 * query-specific dynamic imports.
 */

export async function withDatabase(task) {
  const { register } = await import("tsx/esm/api");
  const unregister = register({ tsconfig: "./tsconfig.json" });
  try {
    const { closeDatabaseConnection } = await import("../../src/lib/db/connection.ts");
    try {
      return await task();
    } finally {
      await closeDatabaseConnection();
    }
  } finally {
    await unregister();
  }
}
