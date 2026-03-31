/**
 * Discovery Feed Types
 *
 * Types for the topic-organized discovery feed on the /bookmarks page.
 * Covers scoring, grouping, and component props for the discover layout.
 */

import type { UnifiedBookmark } from "../schemas/bookmark";
import type { SerializableBookmark } from "./bookmarks";
import type { EngagementContentType } from "../schemas/engagement";

// ---------------------------------------------------------------------------
// Tag Taxonomy (shared across discovery modules)
// ---------------------------------------------------------------------------

export interface TagTaxonomyMaps {
  primaryBySlug: ReadonlyMap<string, string>;
  aliasToCanonical: ReadonlyMap<string, string>;
}

export type BookmarkForDiscovery = Pick<
  UnifiedBookmark,
  "id" | "url" | "title" | "description" | "slug" | "tags" | "dateBookmarked"
> &
  Partial<UnifiedBookmark>;

// ---------------------------------------------------------------------------
// Scoring & Grouping
// ---------------------------------------------------------------------------

export type ScoredBookmark = {
  bookmark: Pick<
    UnifiedBookmark,
    "id" | "url" | "title" | "description" | "slug" | "tags" | "dateBookmarked"
  > &
    Partial<UnifiedBookmark>;
  primaryTag: {
    slug: string;
    name: string;
  } | null;
  discoveryScore: number;
};

export type TopicSection = {
  tagSlug: string;
  tagName: string;
  topScore: number;
  totalCount: number;
  bookmarks: ScoredBookmark["bookmark"][];
};

type GroupOptions = {
  perSection: number;
  minPerSection: number;
};

type RecentOptions = {
  days: number;
  limit: number;
};

export type { GroupOptions, RecentOptions };

// ---------------------------------------------------------------------------
// Server → Client Data Transfer
// ---------------------------------------------------------------------------

export type DiscoverFeedContent = {
  recentlyAdded: SerializableBookmark[];
  topicSections: Array<{
    tagSlug: string;
    tagName: string;
    topScore: number;
    totalCount: number;
    bookmarks: SerializableBookmark[];
  }>;
  internalHrefs: Record<string, string>;
  pagination: {
    sectionPage: number;
    sectionsPerPage: number;
    totalSections: number;
    hasNextSectionPage: boolean;
    nextSectionPage: number | null;
  };
  degradation: {
    isDegraded: boolean;
    reasons: string[];
  };
};

// ---------------------------------------------------------------------------
// Component Props
// ---------------------------------------------------------------------------

export type DiscoverFeedProps = {
  data: DiscoverFeedContent;
};

export type DiscoverFeedWrapperProps = {
  sectionPage: number;
  sectionsPerPage: number;
  recencyDays?: number;
};

export type TopicSectionProps = {
  id: string;
  tagSlug: string;
  tagName: string;
  totalCount: number;
  bookmarks: SerializableBookmark[];
  internalHrefs: Readonly<Record<string, string>>;
  onImpression: (contentType: EngagementContentType, contentId: string) => void;
  priorityImageCount?: number;
  showSeeAll?: boolean;
};
