"use client";

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { TopicSection } from "./topic-section.client";
import { TerminalContext } from "@/components/ui/context-notes/terminal-context.client";
import { useEngagementTracker } from "@/hooks/use-engagement-tracker";
import type { DiscoverFeedContent, DiscoverFeedProps } from "@/types/features/discovery";

const DISCOVER_PRIORITY_ROW_IMAGE_COUNT = 4;
const OBSERVER_ROOT_MARGIN = "960px 0px";
const OPTIMISTIC_EXPAND_DELAY_MS = 150;
const MAX_RECENCY_DAYS = 720;

function mergeTopicSections(
  currentSections: ReadonlyArray<DiscoverFeedContent["topicSections"][number]>,
  incomingSections: ReadonlyArray<DiscoverFeedContent["topicSections"][number]>,
): DiscoverFeedContent["topicSections"][number][] {
  const sectionByTagSlug = new Map(currentSections.map((section) => [section.tagSlug, section]));
  for (const section of incomingSections) {
    sectionByTagSlug.set(section.tagSlug, section);
  }
  return Array.from(sectionByTagSlug.values());
}

function parseGroupedDiscoverPayload(payload: unknown): DiscoverFeedContent {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Invalid discover feed payload: response was not an object.");
  }
  const root = payload as { data?: unknown };
  if (typeof root.data !== "object" || root.data === null) {
    throw new Error("Invalid discover feed payload: missing data object.");
  }
  const feedPayload = root.data as Partial<DiscoverFeedContent>;
  const pagination = feedPayload.pagination;
  const degradation = feedPayload.degradation;
  if (
    !Array.isArray(feedPayload.recentlyAdded) ||
    !Array.isArray(feedPayload.topicSections) ||
    typeof feedPayload.internalHrefs !== "object" ||
    feedPayload.internalHrefs === null ||
    !pagination ||
    typeof pagination.hasNextSectionPage !== "boolean" ||
    !degradation ||
    typeof degradation.isDegraded !== "boolean" ||
    !Array.isArray(degradation.reasons)
  ) {
    throw new Error("Invalid discover feed payload: missing required grouped discover fields.");
  }
  return feedPayload as DiscoverFeedContent;
}

export function DiscoverFeed({ data }: Readonly<DiscoverFeedProps>) {
  const { trackImpression } = useEngagementTracker();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadMoreInFlightRef = useRef(false);
  const optimisticLoadStartedRef = useRef(false);
  const [topicSections, setTopicSections] = useState<DiscoverFeedContent["topicSections"]>(
    () => data.topicSections,
  );
  const [internalHrefs, setInternalHrefs] = useState<Record<string, string>>(
    () => data.internalHrefs,
  );
  const [pagination, setPagination] = useState(() => data.pagination);
  const [degradation, setDegradation] = useState(() => data.degradation);
  const [currentRecencyDays, setCurrentRecencyDays] = useState(90);
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

  const hasMorePages = pagination.hasNextSectionPage;
  const canExpandWindow = !hasMorePages && currentRecencyDays < MAX_RECENCY_DAYS;
  const hasMoreTopicSections = hasMorePages || canExpandWindow;
  const canAutoLoadMore = hasMoreTopicSections && loadMoreError === null && isAutoExpandAvailable;

  const fetchGroupedDiscoverPage = useCallback(
    async (nextSectionPage: number, nextSectionsPerPage: number, recencyDays: number) => {
      const params = new URLSearchParams({
        feed: "discover",
        discoverView: "grouped",
        sectionPage: String(nextSectionPage),
        sectionsPerPage: String(nextSectionsPerPage),
        recencyDays: String(recencyDays),
      });
      const response = await fetch(`/api/bookmarks?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Failed to load more sections (${response.status})`);
      }
      const payload: unknown = await response.json();
      return parseGroupedDiscoverPayload(payload);
    },
    [],
  );

  const loadMoreTopicSections = useCallback(async () => {
    if (loadMoreInFlightRef.current) return;

    const morePages = pagination.hasNextSectionPage;
    const expandable = !morePages && currentRecencyDays < MAX_RECENCY_DAYS;
    if (!morePages && !expandable) return;

    loadMoreInFlightRef.current = true;
    setIsLoadingMore(true);
    setLoadMoreError(null);

    // Phase 1: paginate within current recency window (fixed dataset)
    // Phase 2: when window exhausted, expand recency and restart from page 1
    const isExpanding = !morePages;
    const nextRecencyDays = isExpanding ? currentRecencyDays * 2 : currentRecencyDays;
    const nextPage = isExpanding ? 1 : (pagination.nextSectionPage ?? 1);

    try {
      const nextData = await fetchGroupedDiscoverPage(
        nextPage,
        pagination.sectionsPerPage,
        nextRecencyDays,
      );
      startTransition(() => {
        setTopicSections((current) => mergeTopicSections(current, nextData.topicSections));
        setInternalHrefs((current) => ({ ...current, ...nextData.internalHrefs }));
        setPagination(nextData.pagination);
        if (isExpanding) {
          setCurrentRecencyDays(nextRecencyDays);
        }
        setDegradation((current) => {
          const mergedReasons = [...current.reasons, ...nextData.degradation.reasons];
          const uniqueReasons = Array.from(new Set(mergedReasons));
          return {
            isDegraded: uniqueReasons.length > 0,
            reasons: uniqueReasons,
          };
        });
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to load more sections";
      setLoadMoreError(errorMessage);
      setDegradation((current) => {
        const mergedReasons = [
          ...current.reasons,
          `Infinite-scroll expansion failed: ${errorMessage}`,
        ];
        const uniqueReasons = Array.from(new Set(mergedReasons));
        return {
          isDegraded: true,
          reasons: uniqueReasons,
        };
      });
    } finally {
      loadMoreInFlightRef.current = false;
      setIsLoadingMore(false);
    }
  }, [fetchGroupedDiscoverPage, pagination, currentRecencyDays]);

  useEffect(() => {
    if (
      !canAutoLoadMore ||
      optimisticLoadStartedRef.current ||
      pagination.sectionPage !== 1 ||
      topicSections.length === 0
    ) {
      return;
    }

    optimisticLoadStartedRef.current = true;
    const timeoutId = window.setTimeout(() => {
      void loadMoreTopicSections();
    }, OPTIMISTIC_EXPAND_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [canAutoLoadMore, loadMoreTopicSections, pagination.sectionPage, topicSections.length]);

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
      setDegradation((current) => {
        const mergedReasons = [
          ...current.reasons,
          "Infinite-scroll auto-expansion is unavailable in this browser.",
        ];
        const uniqueReasons = Array.from(new Set(mergedReasons));
        return {
          isDegraded: true,
          reasons: uniqueReasons,
        };
      });
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

  const isDegraded = degradation.isDegraded || degradation.reasons.length > 0;

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
          <p>{degradation.reasons.join(" ")}</p>
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
            priorityImageCount={DISCOVER_PRIORITY_ROW_IMAGE_COUNT}
            showSeeAll={false}
          />
        </div>
      )}

      <div className="space-y-12">
        {topicSections.map((section, index) => (
          <TopicSection
            key={section.tagSlug}
            id={section.tagSlug}
            tagSlug={section.tagSlug}
            tagName={section.tagName}
            totalCount={section.totalCount}
            bookmarks={section.bookmarks}
            internalHrefs={internalHrefs}
            onImpression={trackImpression}
            priorityImageCount={
              data.recentlyAdded.length === 0 && index === 0 ? DISCOVER_PRIORITY_ROW_IMAGE_COUNT : 0
            }
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
