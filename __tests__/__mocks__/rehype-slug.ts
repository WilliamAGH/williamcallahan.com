/**
 * @file Manual mock for the rehype-slug package.
 */
import { vi } from "vitest";
import type rehypeSlug from "rehype-slug";

export default vi.fn<typeof rehypeSlug>(() => () => {});
