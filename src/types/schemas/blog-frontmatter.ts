import { z } from "zod/v4";

export const blogSlugSchema = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,198}[a-z0-9])?$/)
  .refine((slug) => !slug.includes("--"), { message: "Slug cannot contain consecutive hyphens" });

const blogDateSchema = z.union([z.string(), z.date()]);

export const blogFrontmatterSchema = z.object({
  slug: blogSlugSchema,
  title: z.string().trim().min(1),
  author: z.string().trim().min(1),
  publishedAt: blogDateSchema.optional(),
  updatedAt: blogDateSchema.optional(),
  excerpt: z.string().optional(),
  tags: z.array(z.string()).default([]),
  readingTime: z.number().optional(),
  coverImage: z.string().optional(),
  draft: z.boolean().optional(),
});

export type BlogFrontmatter = z.infer<typeof blogFrontmatterSchema>;

export const blogPostInputSchema = z.object({
  frontmatter: blogFrontmatterSchema.required({ publishedAt: true }),
  rawContent: z.string(),
});

export type BlogPostInput = z.infer<typeof blogPostInputSchema>;
