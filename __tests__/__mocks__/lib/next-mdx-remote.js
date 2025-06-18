/* eslint-env jest */

/**
 * @file Mocks the 'next-mdx-remote' library for Jest tests
 * @description Provides a lightweight 'serialize' mock to avoid MDX compilation overhead
 */
module.exports = {
  /**
   * Mock of the 'next-mdx-remote/serialize' function
   * @param {string} source - The MDX source string
   * @returns {object} A mock MDX-serialized object
   */
  serialize: jest.fn((source /*, options */) => ({
    compiledSource: source ?? "",
    frontmatter: {},
    scope: {},
  })),
};
