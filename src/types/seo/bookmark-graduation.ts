import type { Metadata } from "next";
import type { BookmarkTopicHubEvidence } from "@/types/schemas/bookmark-seo";

export interface BookmarkIndexabilityInput {
  note?: string | null;
  summary?: string | null;
  description?: string | null;
  sourceUnavailable?: boolean;
  archived?: boolean;
  isPrivate?: boolean;
  isCanonicalSlug?: boolean;
}

export interface BookmarkIndexabilityVerdict {
  indexable: boolean;
  noteChars: number;
  noteWords: number;
  combinedChars: number;
  robots: NonNullable<Metadata["robots"]>;
}

export interface TagHubIndexabilityInput {
  totalCount: number;
  pageNumber: number;
  isAlias?: boolean;
}

export interface TagHubIndexabilityVerdict {
  indexable: boolean;
  robots: NonNullable<Metadata["robots"]>;
}

export interface GraduatedBookmarkDescriptionInput {
  note?: string | null;
  summary?: string | null;
  description?: string | null;
  domainName: string;
}

export interface GraduatedTagHubDescriptionInput {
  displayTag: string;
  totalCount: number;
  annotatedCount?: number;
  topDomains?: string[];
}

export interface BookmarkTopicHubOverviewProps {
  displayTag: string;
  evidence: BookmarkTopicHubEvidence;
}

export interface BookmarksSitemapXmlCacheEntry {
  generatedAt: number;
  xml: string;
}
