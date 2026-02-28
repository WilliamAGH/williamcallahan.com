/**
 * Discovery Feed Types
 *
 * Types for the topic-organized discovery feed on the /bookmarks page.
 * Covers scoring, grouping, and component props for the discover layout.
 */

import type { UnifiedBookmark } from "../bookmark";
import type { SerializableBookmark } from "./bookmarks";
import type { EngagementContentType } from "../schemas/engagement";

// ---------------------------------------------------------------------------
// Scoring & Grouping
// ---------------------------------------------------------------------------

export type ScoredBookmarkRow = {
  bookmark: Pick<
    UnifiedBookmark,
    "id" | "url" | "title" | "description" | "slug" | "tags" | "dateBookmarked"
  > &
    Partial<UnifiedBookmark>;
  category: string | null;
  discoveryScore: number;
};

export type TopicSection = {
  category: string;
  topScore: number;
  totalCount: number;
  bookmarks: ScoredBookmarkRow["bookmark"][];
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

export type DiscoverFeedData = {
  recentlyAdded: SerializableBookmark[];
  topicSections: Array<{
    category: string;
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
  data: DiscoverFeedData;
};

export type TopicSectionProps = {
  id: string;
  category: string;
  totalCount: number;
  bookmarks: SerializableBookmark[];
  internalHrefs: Readonly<Record<string, string>>;
  onImpression: (contentType: EngagementContentType, contentId: string) => void;
  showSeeAll?: boolean;
};
