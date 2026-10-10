/**
 * Mock for next-mdx-remote/serialize subpath
 */
import { vi } from "vitest";
import type * as MdxRemoteSerialize from "next-mdx-remote/serialize";

export const serialize = vi.fn<typeof MdxRemoteSerialize.serialize>().mockResolvedValue({
  compiledSource: "",
  scope: {},
  frontmatter: {},
});

export default serialize;
