import { DiscoverFeed } from "./discover-feed.client";
import { getDiscoveryGroupedBookmarks } from "@/lib/db/queries/discovery-grouped";
import type { DiscoverFeedContent, DiscoverFeedWrapperProps } from "@/types/features/discovery";

/**
 * Server component that fetches discover feed data with streaming support.
 * Wrapped in Suspense at the page level to prevent blocking the entire route.
 */
export async function DiscoverFeedWrapper({
  sectionPage,
  sectionsPerPage,
  recencyDays,
}: DiscoverFeedWrapperProps) {
  let discoverData: DiscoverFeedContent;
  try {
    discoverData = await getDiscoveryGroupedBookmarks({
      sectionPage,
      sectionsPerPage,
      recencyDays,
    });
  } catch (error) {
    console.error(
      "[DiscoverFeedWrapper] Discover feed fetch failed. Rendering degraded mode.",
      error,
    );
    discoverData = {
      recentlyAdded: [],
      topicSections: [],
      internalHrefs: {},
      pagination: {
        sectionPage,
        sectionsPerPage,
        totalSections: 0,
        hasNextSectionPage: false,
        nextSectionPage: null,
      },
      degradation: {
        isDegraded: true,
        reasons: ["Discover feed is temporarily unavailable. Please retry later."],
      },
    };
  }

  return <DiscoverFeed data={discoverData} />;
}

export function DiscoverFeedSkeleton() {
  return (
    <div className="space-y-12 animate-pulse">
      <div className="space-y-4">
        <div className="h-8 w-48 bg-gray-200 dark:bg-gray-800 rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="aspect-video bg-gray-100 dark:bg-gray-900 rounded-xl" />
          ))}
        </div>
      </div>
      <div className="space-y-4">
        <div className="h-8 w-64 bg-gray-200 dark:bg-gray-800 rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="aspect-video bg-gray-100 dark:bg-gray-900 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
