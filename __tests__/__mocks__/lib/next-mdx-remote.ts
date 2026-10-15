/**
 * Mock for next-mdx-remote library
 */
import { vi } from "vitest";
import type * as MdxRemoteSerialize from "next-mdx-remote/serialize";

export const serialize = vi.fn<typeof MdxRemoteSerialize.serialize>().mockResolvedValue({
  compiledSource: "",
  scope: {},
  frontmatter: {},
});

export const MDXRemote = vi.fn<() => null>(() => null);

export default { serialize, MDXRemote };
