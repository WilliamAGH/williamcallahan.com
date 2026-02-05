/**
 * Mock for next-mdx-remote/serialize subpath
 */
import { vi } from "vitest";

export const serialize = vi.fn().mockResolvedValue({
  compiledSource: "",
  scope: {},
  frontmatter: {},
});

export default serialize;
