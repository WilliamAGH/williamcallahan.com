import { blogSlugSchema } from "@/types/schemas/blog-frontmatter";

/** Reject path-like and high-cardinality values before blog lookup or route caching. */
export function isValidBlogSlug(slug: string): boolean {
  return blogSlugSchema.safeParse(slug).success;
}
