import { z } from "zod/v4";

export const blogSlugSchema = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,198}[a-z0-9])?$/)
  .refine((slug) => !slug.includes("--"), { message: "Slug cannot contain consecutive hyphens" });

const blogDateSchema = z.union([z.iso.date(), z.date()]);
const trimmedTextSchema = z.string().trim().min(1);

export const blogFrontmatterSchema = z
  .object({
    slug: blogSlugSchema,
    title: z.string().trim().min(1),
    author: z.string().trim().min(1),
    publishedAt: blogDateSchema,
    updatedAt: blogDateSchema.optional(),
    excerpt: trimmedTextSchema,
    tags: z.array(trimmedTextSchema),
    readingTime: z.number().optional(),
    coverImage: trimmedTextSchema.optional(),
    draft: z.boolean().optional(),
  })
  .strict();

export type BlogFrontmatter = z.infer<typeof blogFrontmatterSchema>;

export const blogPostInputSchema = z.object({
  frontmatter: blogFrontmatterSchema,
  rawContent: z.string(),
});

export type BlogPostInput = z.infer<typeof blogPostInputSchema>;
