/**
 * @file Generic Jest mock for ESM-only unified/rehype/remark plugins
 * @description Mocks ESM-only markdown plugins for CommonJS-based Jest environment
 */

/**
 * No-op transformer that mimics a unified/rehype/remark plugin
 * @returns {function(object): object} A function that returns the syntax tree unchanged
 */
function dummyPlugin() {
  return (_tree) => _tree;
}

module.exports = dummyPlugin;
