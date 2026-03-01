"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { TopicSection } from "./topic-section.client";
import { TerminalContext } from "@/components/ui/context-notes/terminal-context.client";
import { useEngagementTracker } from "@/hooks/use-engagement-tracker";
import type { DiscoverFeedData, DiscoverFeedProps } from "@/types/features/discovery";

const OBSERVER_ROOT_MARGIN = "280px 0px";

function mergeTopicSections(
  currentSections: ReadonlyArray<DiscoverFeedData["topicSections"][number]>,
  incomingSections: ReadonlyArray<DiscoverFeedData["topicSections"][number]>,
): DiscoverFeedData["topicSections"][number][] {
  const sectionByTagSlug = new Map(currentSections.map((section) => [section.tagSlug, section]));
  for (const section of incomingSections) {
    sectionByTagSlug.set(section.tagSlug, section);
  }
  return Array.from(sectionByTagSlug.values());
}

function parseGroupedDiscoverPayload(payload: unknown): DiscoverFeedData {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Invalid discover feed payload: response was not an object.");
  }
  const root = payload as { data?: unknown };
  if (typeof root.data !== "object" || root.data === null) {
    throw new Error("Invalid discover feed payload: missing data object.");
  }
  const data = root.data as Partial<DiscoverFeedData>;
  const pagination = data.pagination;
  const degradation = data.degradation;
  if (
    !Array.isArray(data.recentlyAdded) ||
    !Array.isArray(data.topicSections) ||
    typeof data.internalHrefs !== "object" ||
    data.internalHrefs === null ||
    !pagination ||
    typeof pagination.hasNextSectionPage !== "boolean" ||
    !degradation ||
    typeof degradation.isDegraded !== "boolean" ||
    !Array.isArray(degradation.reasons)
  ) {
    throw new Error("Invalid discover feed payload: missing required grouped discover fields.");
  }
  return data as DiscoverFeedData;
}

export function DiscoverFeed({ data }: Readonly<DiscoverFeedProps>) {
  const { trackImpression } = useEngagementTracker();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreInFlightRef = useRef(false);
  const [topicSections, setTopicSections] = useState<DiscoverFeedData["topicSections"]>(
    () => data.topicSections,
  );
  const [internalHrefs, setInternalHrefs] = useState<Record<string, string>>(
    () => data.internalHrefs,
  );
  const [pagination, setPagination] = useState(() => data.pagination);
  const [degradation, setDegradation] = useState(() => data.degradation);
  const [isAutoExpandAvailable, setIsAutoExpandAvailable] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  const topicNavigation = useMemo(
    () =>
      topicSections.map((s) => ({
        name: s.tagName,
        id: s.tagSlug,
      })),
    [topicSections],
  );

  const hasMoreTopicSections = pagination.hasNextSectionPage;
  const canAutoLoadMore = hasMoreTopicSections && loadMoreError === null && isAutoExpandAvailable;

  const fetchGroupedDiscoverPage = useCallback(
    async (nextSectionPage: number, nextSectionsPerPage: number) => {
      const params = new URLSearchParams({
        feed: "discover",
        discoverView: "grouped",
        sectionPage: String(nextSectionPage),
        sectionsPerPage: String(nextSectionsPerPage),
      });
      const response = await fetch(`/api/bookmarks?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Failed to load more sections (${response.status})`);
      }
      const payload: unknown = await response.json();
      return parseGroupedDiscoverPayload(payload);
    },
    [],
  );

  const loadMoreTopicSections = useCallback(async () => {
    if (
      !pagination.hasNextSectionPage ||
      pagination.nextSectionPage === null ||
      loadMoreInFlightRef.current
    ) {
      return;
    }
    loadMoreInFlightRef.current = true;
    setIsLoadingMore(true);
    setLoadMoreError(null);

    try {
      const nextData = await fetchGroupedDiscoverPage(
        pagination.nextSectionPage,
        pagination.sectionsPerPage,
      );
      setTopicSections((current) => mergeTopicSections(current, nextData.topicSections));
      setInternalHrefs((current) => ({ ...current, ...nextData.internalHrefs }));
      setPagination(nextData.pagination);
      setDegradation((current) => ({
        isDegraded: current.isDegraded || nextData.degradation.isDegraded,
        reasons: [...current.reasons, ...nextData.degradation.reasons],
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to load more sections";
      setLoadMoreError(errorMessage);
      setDegradation((current) => ({
        isDegraded: true,
        reasons: [...current.reasons, `Infinite-scroll expansion failed: ${errorMessage}`],
      }));
    } finally {
      loadMoreInFlightRef.current = false;
      setIsLoadingMore(false);
    }
  }, [fetchGroupedDiscoverPage, pagination]);

  const scrollToSection = useCallback((sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  useEffect(() => {
    if (!canAutoLoadMore) {
      return;
    }
    if (typeof window !== "undefined" && typeof window.IntersectionObserver === "undefined") {
      setIsAutoExpandAvailable(false);
      setDegradation((current) => ({
        isDegraded: true,
        reasons: [
          ...current.reasons,
          "Infinite-scroll auto-expansion is unavailable in this browser.",
        ],
      }));
      return;
    }

    const target = sentinelRef.current;
    if (!target) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const firstEntry = entries[0];
        if (firstEntry?.isIntersecting) {
          void loadMoreTopicSections();
        }
      },
      {
        root: null,
        rootMargin: OBSERVER_ROOT_MARGIN,
        threshold: 0.01,
      },
    );

    observer.observe(target);

    return () => {
      observer.unobserve(target);
      observer.disconnect();
    };
  }, [canAutoLoadMore, loadMoreTopicSections]);

  useEffect(() => {
    if (!canAutoLoadMore) {
      return;
    }

    const target = sentinelRef.current;
    if (!target) {
      return;
    }

    const top = target.getBoundingClientRect().top;
    if (top <= window.innerHeight) {
      void loadMoreTopicSections();
    }
  }, [canAutoLoadMore, loadMoreTopicSections, topicSections.length]);

  const degradationReasons = useMemo(
    () => Array.from(new Set(degradation.reasons)),
    [degradation.reasons],
  );
  const isDegraded = degradation.isDegraded || degradationReasons.length > 0;

  return (
    <div className="w-full max-w-[95%] xl:max-w-[1400px] 2xl:max-w-[1800px] mx-auto px-4">
      <nav
        className="sticky top-0 z-30 bg-background/80 backdrop-blur-sm border-b border-border -mx-4 px-4 py-2 mb-8"
        aria-label="Topic navigation"
      >
        <div className="flex items-center gap-3 mb-1.5">
          <h1 className="text-sm font-medium text-foreground shrink-0">Bookmarks</h1>
          <TerminalContext type="bookmark" />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
          {topicNavigation.map((cat) => (
            <Button
              key={cat.id}
              type="button"
              size="sm"
              variant="ghost"
              className="shrink-0 rounded-full"
              onClick={() => scrollToSection(cat.id)}
            >
              {cat.name}
            </Button>
          ))}
        </div>
      </nav>

      {isDegraded && (
        <div className="mb-6 rounded-lg border border-amber-300/70 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-100">
          <p className="font-medium">Discover feed is running in degraded mode.</p>
          <p>{degradationReasons.join(" ")}</p>
        </div>
      )}

      {loadMoreError && (
        <div className="mb-6 rounded-lg border border-red-300/70 bg-red-50/80 px-4 py-3 text-sm text-red-900 dark:border-red-500/40 dark:bg-red-950/30 dark:text-red-100">
          <p className="font-medium">Unable to load additional bookmark sections.</p>
          <p>{loadMoreError}</p>
          <Button
            className="mt-3"
            size="sm"
            variant="secondary"
            onClick={() => void loadMoreTopicSections()}
          >
            Retry loading
          </Button>
        </div>
      )}

      {data.recentlyAdded.length > 0 && (
        <div className="mb-12">
          <TopicSection
            id="recently-added"
            tagSlug="recently-added"
            tagName="Recently Added"
            totalCount={data.recentlyAdded.length}
            bookmarks={data.recentlyAdded}
            internalHrefs={data.internalHrefs}
            onImpression={trackImpression}
            showSeeAll={false}
          />
        </div>
      )}

      <div className="space-y-12">
        {topicSections.map((section) => (
          <TopicSection
            key={section.tagSlug}
            id={section.tagSlug}
            tagSlug={section.tagSlug}
            tagName={section.tagName}
            totalCount={section.totalCount}
            bookmarks={section.bookmarks}
            internalHrefs={internalHrefs}
            onImpression={trackImpression}
          />
        ))}
      </div>

      {!isAutoExpandAvailable && hasMoreTopicSections && !loadMoreError && (
        <div className="mt-5 flex justify-center">
          <Button size="sm" variant="secondary" onClick={() => void loadMoreTopicSections()}>
            Load next bookmark sections
          </Button>
        </div>
      )}

      {hasMoreTopicSections && isAutoExpandAvailable && (
        <div ref={sentinelRef} className="h-8 w-full" aria-hidden="true" />
      )}
      {isLoadingMore && (
        <div className="flex items-center justify-center py-4 text-sm text-muted-foreground">
          Loading more sections...
        </div>
      )}
    </div>
  );
}
