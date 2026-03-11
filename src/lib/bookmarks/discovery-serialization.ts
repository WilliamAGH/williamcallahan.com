import type { SerializableBookmark } from "@/types/features/bookmarks";
import type { BookmarkForDiscovery } from "@/types/features/discovery";

export function serializeBookmark(bookmark: BookmarkForDiscovery): SerializableBookmark {
  return {
    id: bookmark.id,
    url: bookmark.url,
    title: bookmark.title,
    description: bookmark.description,
    slug: bookmark.slug,
    tags: Array.isArray(bookmark.tags) ? bookmark.tags : [],
    dateBookmarked: bookmark.dateBookmarked,
    ogImage: bookmark.ogImage,
    ogImageExternal: bookmark.ogImageExternal,
    content: bookmark.content,
    isPrivate: bookmark.isPrivate ?? false,
    isFavorite: bookmark.isFavorite ?? false,
    readingTime: bookmark.readingTime,
    wordCount: bookmark.wordCount,
    ogTitle: bookmark.ogTitle,
    ogDescription: bookmark.ogDescription,
    domain: bookmark.domain,
    logoData: bookmark.logoData
      ? {
          url: bookmark.logoData.url,
          alt: bookmark.logoData.alt ?? "Logo",
          width: bookmark.logoData.width,
          height: bookmark.logoData.height,
        }
      : null,
  };
}

export function createSerializeWithHref(
  internalHrefs: Record<string, string>,
): (bookmark: BookmarkForDiscovery) => SerializableBookmark {
  return (bookmark: BookmarkForDiscovery) => {
    internalHrefs[bookmark.id] = `/bookmarks/${bookmark.slug}`;
    return serializeBookmark(bookmark);
  };
}
