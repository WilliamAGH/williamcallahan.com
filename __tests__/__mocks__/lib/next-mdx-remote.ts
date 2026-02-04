/**
 * Mock for next-mdx-remote library
 */
import { vi } from "vitest";

export const serialize = vi.fn().mockResolvedValue({
  compiledSource: "",
  scope: {},
  frontmatter: {},
});

export const MDXRemote = vi.fn(() => null);

export default { serialize, MDXRemote };
