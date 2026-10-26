import { z } from "zod/v4";

export const graduatedBookmarkSitemapEntrySchema = z.object({
  slug: z.string().min(1),
  lastModified: z.string().min(1),
});
export type GraduatedBookmarkSitemapEntry = z.infer<typeof graduatedBookmarkSitemapEntrySchema>;

export const graduatedBookmarkCandidateRowSchema = z.object({
  slug: z.string().min(1),
  lastModified: z.string().min(1),
  note: z.string().nullable(),
  summary: z.string().nullable(),
  description: z.string().nullable(),
});
export type GraduatedBookmarkCandidateRow = z.infer<typeof graduatedBookmarkCandidateRowSchema>;

export const graduatedTagHubSitemapEntrySchema = z.object({
  tagSlug: z.string().min(1),
  bookmarkCount: z.coerce.number().int().nonnegative(),
  lastModified: z.string().min(1),
});
export type GraduatedTagHubSitemapEntry = z.infer<typeof graduatedTagHubSitemapEntrySchema>;

export const topicHubResourceBriefSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  url: z.string().min(1),
  domain: z.string(),
  dateBookmarked: z.string().min(1),
  note: z.string().nullable(),
  summary: z.string().nullable(),
  description: z.string(),
  category: z.string().nullable(),
  format: z.string().nullable(),
  accessMethod: z.string().nullable(),
  primaryHighlight: z.string().nullable(),
});
export type TopicHubResourceBrief = z.infer<typeof topicHubResourceBriefSchema>;

export const bookmarkTopicHubEvidenceSchema = z.object({
  canonicalSlug: z.string().min(1),
  totalCount: z.coerce.number().int().nonnegative(),
  analyzedCount: z.coerce.number().int().nonnegative(),
  annotatedCount: z.coerce.number().int().nonnegative(),
  topDomains: z.array(z.string()),
  topCategories: z.array(z.string()),
  annotatedBookmarks: z.array(topicHubResourceBriefSchema),
  matrixResources: z.array(topicHubResourceBriefSchema),
});
export type BookmarkTopicHubEvidence = z.infer<typeof bookmarkTopicHubEvidenceSchema>;
