"use client";

import { BookmarkCardClient } from "./bookmark-card.client";
import { ImpressionTracker } from "./impression-tracker.client";
import type { HeroRowProps } from "@/types/features/bookmarks";

export function HeroRow({ bookmarks, internalHrefs, onImpression }: Readonly<HeroRowProps>) {
  const featured = bookmarks[0];
  const secondary = bookmarks.slice(1, 3);

  if (!featured) {
    return null;
  }

  return (
    <section className="mb-8" aria-label="Featured bookmarks">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ImpressionTracker
            contentType="bookmark"
            contentId={featured.id}
            onImpression={onImpression}
          >
            <BookmarkCardClient
              {...featured}
              variant="hero"
              internalHref={internalHrefs?.[featured.id]}
              preload
            />
          </ImpressionTracker>
        </div>
        <div className="grid grid-cols-1 gap-6">
          {secondary.map((bookmark) => (
            <ImpressionTracker
              key={bookmark.id}
              contentType="bookmark"
              contentId={bookmark.id}
              onImpression={onImpression}
            >
              <BookmarkCardClient
                {...bookmark}
                internalHref={internalHrefs?.[bookmark.id]}
                preload
              />
            </ImpressionTracker>
          ))}
        </div>
      </div>
    </section>
  );
}
