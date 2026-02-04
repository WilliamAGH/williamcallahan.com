/**
 * @file Generic mock for ESM-only unified/rehype/remark plugins
 * @description Mocks ESM-only markdown plugins for test environment
 */

/**
 * No-op transformer that mimics a unified/rehype/remark plugin
 * @returns A function that returns the syntax tree unchanged
 */
function dummyPlugin(): (tree: unknown) => unknown {
  return (tree) => tree;
}

export default dummyPlugin;
