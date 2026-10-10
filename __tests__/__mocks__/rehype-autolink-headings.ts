/**
 * @file Manual mock for the rehype-autolink-headings package.
 */
import { vi } from "vitest";
import type rehypeAutolinkHeadings from "rehype-autolink-headings";

export default vi.fn<typeof rehypeAutolinkHeadings>(() => () => {});
