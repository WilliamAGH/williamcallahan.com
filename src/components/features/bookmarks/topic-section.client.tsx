"use client";

import Link from "next/link";
import { Separator } from "@/components/ui/separator";
import { BookmarkCardClient } from "./bookmark-card.client";
import { ImpressionTracker } from "./impression-tracker.client";
import { TopicGrid } from "./topic-grid.client";
import type { TopicSectionProps } from "@/types/features/discovery";

const IMAGE_PRELOAD_COUNT = 2;

export function TopicSection({
  id,
  category,
  totalCount,
  bookmarks,
  internalHrefs,
  onImpression,
  showSeeAll = true,
}: Readonly<TopicSectionProps>) {
  if (bookmarks.length === 0) return null;

  const seeAllHref = `/bookmarks?feed=latest&category=${encodeURIComponent(category)}`;

  return (
    <section id={id} className="scroll-mt-16" aria-label={category}>
      <div className="flex items-center gap-4 mb-4">
        <h2 className="text-xs uppercase tracking-[0.18em] text-muted-foreground shrink-0">
          {category}
        </h2>
        <Separator className="flex-1" />
        {showSeeAll && totalCount > bookmarks.length && (
          <Link
            href={seeAllHref}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
            prefetch={false}
          >
            See all {totalCount} &rarr;
          </Link>
        )}
      </div>
      <TopicGrid>
        {bookmarks.map((bookmark, index) => (
          <ImpressionTracker
            key={bookmark.id}
            contentType="bookmark"
            contentId={bookmark.id}
            onImpression={onImpression}
          >
            <BookmarkCardClient
              id={bookmark.id}
              url={bookmark.url}
              title={bookmark.title}
              description={bookmark.description}
              tags={bookmark.tags}
              ogImage={bookmark.ogImage}
              ogImageExternal={bookmark.ogImageExternal}
              content={bookmark.content}
              dateBookmarked={bookmark.dateBookmarked}
              dateCreated={bookmark.dateCreated}
              isFavorite={bookmark.isFavorite}
              readingTime={bookmark.readingTime}
              wordCount={bookmark.wordCount}
              ogTitle={bookmark.ogTitle}
              ogDescription={bookmark.ogDescription}
              domain={bookmark.domain}
              slug={bookmark.slug}
              variant="compact"
              showCategoryBadge={false}
              category={undefined}
              internalHref={internalHrefs[bookmark.id]}
              preload={index < IMAGE_PRELOAD_COUNT}
            />
          </ImpressionTracker>
        ))}
      </TopicGrid>
    </section>
  );
}
