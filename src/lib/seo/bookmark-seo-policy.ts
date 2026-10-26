import type { Metadata } from "next";
import { SEARCH_EXCLUDED_ROBOTS } from "@/lib/seo/search-exclusion";
import type {
  BookmarkIndexabilityInput,
  BookmarkIndexabilityVerdict,
  GraduatedBookmarkDescriptionInput,
  GraduatedTagHubDescriptionInput,
  TagHubIndexabilityInput,
  TagHubIndexabilityVerdict,
} from "@/types/seo/bookmark-graduation";

export const MIN_BOOKMARK_NOTE_CHARS = 100;
export const MIN_BOOKMARK_NOTE_WORDS = 15;
export const MIN_BOOKMARK_COMBINED_CHARS = 250;
export const MIN_TAG_HUB_BOOKMARKS = 12;
export const INDEXABLE_ROBOTS: NonNullable<Metadata["robots"]> = { index: true, follow: true };

const FIRST_TAG_PAGE = 1;
const MAX_META_DESCRIPTION_CHARS = 160;
const MIN_WORD_BOUNDARY_CHARS = 110;
const MAX_GRADUATED_BOOKMARK_TITLE_CHARS = 70;
const FIELD_NOTES_SUFFIX = " — Field Notes";
const DOMAIN_WRAPPER_OVERHEAD_CHARS = 3;
const MIN_TITLE_WORD_BOUNDARY_CHARS = 24;
const MAX_TOP_DOMAINS_IN_DESCRIPTION = 3;

export function countWords(text: string): number {
  const trimmedText = text.trim();
  return trimmedText.length === 0 ? 0 : trimmedText.split(/\s+/).length;
}

export function evaluateBookmarkIndexability(
  input: BookmarkIndexabilityInput,
): BookmarkIndexabilityVerdict {
  const trimmedNote = (input.note ?? "").replace(/\s+/g, " ").trim();
  const trimmedSummary = (input.summary ?? "").replace(/\s+/g, " ").trim();
  const trimmedDescription = (input.description ?? "").replace(/\s+/g, " ").trim();
  const noteChars = trimmedNote.length;
  const noteWords = countWords(trimmedNote);
  const combinedText = [trimmedNote, trimmedSummary, trimmedDescription]
    .filter((part) => part.length > 0)
    .join(" ");
  const combinedChars = combinedText.length;
  const indexable =
    !input.archived &&
    !input.isPrivate &&
    input.isCanonicalSlug !== false &&
    !input.sourceUnavailable &&
    noteChars >= MIN_BOOKMARK_NOTE_CHARS &&
    noteWords >= MIN_BOOKMARK_NOTE_WORDS &&
    combinedChars >= MIN_BOOKMARK_COMBINED_CHARS;

  return {
    indexable,
    noteChars,
    noteWords,
    combinedChars,
    robots: indexable ? INDEXABLE_ROBOTS : SEARCH_EXCLUDED_ROBOTS,
  };
}

export function evaluateTagHubIndexability(
  input: TagHubIndexabilityInput,
): TagHubIndexabilityVerdict {
  const indexable =
    !input.isAlias &&
    input.pageNumber === FIRST_TAG_PAGE &&
    input.totalCount >= MIN_TAG_HUB_BOOKMARKS;
  return { indexable, robots: indexable ? INDEXABLE_ROBOTS : SEARCH_EXCLUDED_ROBOTS };
}

export function buildGraduatedBookmarkTitle(title: string, domainName?: string): string {
  const trimmedTitle = (title.replace(/\s+/g, " ").trim() || "Bookmark").trim();
  const cleanDomain = domainName && domainName !== "website" ? domainName.trim() : "";
  if (
    cleanDomain.length > 0 &&
    trimmedTitle.length +
      cleanDomain.length +
      DOMAIN_WRAPPER_OVERHEAD_CHARS +
      FIELD_NOTES_SUFFIX.length <=
      MAX_GRADUATED_BOOKMARK_TITLE_CHARS
  ) {
    return `${trimmedTitle} (${cleanDomain})${FIELD_NOTES_SUFFIX}`;
  }
  const maxCoreChars = MAX_GRADUATED_BOOKMARK_TITLE_CHARS - FIELD_NOTES_SUFFIX.length;
  const boundedCore = truncateAtWordBoundary(
    trimmedTitle,
    maxCoreChars,
    MIN_TITLE_WORD_BOUNDARY_CHARS,
  );
  return `${boundedCore}${FIELD_NOTES_SUFFIX}`;
}

function truncateAtWordBoundary(
  text: string,
  maxChars: number,
  minWordBoundaryChars = MIN_WORD_BOUNDARY_CHARS,
): string {
  const normalizedText = text.replace(/\s+/g, " ").trim();
  if (normalizedText.length <= maxChars) return normalizedText;
  const truncatedText = normalizedText.slice(0, maxChars - 1);
  const lastSpace = truncatedText.lastIndexOf(" ");
  return lastSpace >= minWordBoundaryChars
    ? `${truncatedText.slice(0, lastSpace)}…`
    : `${truncatedText.trimEnd()}…`;
}

export function buildGraduatedBookmarkDescription(
  input: GraduatedBookmarkDescriptionInput,
): string {
  const note = (input.note ?? "").replace(/\s+/g, " ").trim();
  const summary = (input.summary ?? "").replace(/\s+/g, " ").trim();
  const description = (input.description ?? "").replace(/\s+/g, " ").trim();
  const supportingText = summary || description;
  let descriptionText = note || supportingText;
  if (note.length > 0 && note.length < MAX_META_DESCRIPTION_CHARS && supportingText) {
    const punctuatedNote = /[.!?…]$/.test(note) ? note : `${note}.`;
    descriptionText = `${punctuatedNote} ${supportingText}`;
  }
  return truncateAtWordBoundary(
    descriptionText ||
      `Notes on a resource from ${input.domainName || "the web"} curated by William Callahan.`,
    MAX_META_DESCRIPTION_CHARS,
  );
}

export function buildGraduatedTagHubDescription(input: GraduatedTagHubDescriptionInput): string {
  const annotatedClause =
    input.annotatedCount && input.annotatedCount > 0
      ? `, including ${input.annotatedCount} with practitioner notes`
      : "";
  const domainsList = (input.topDomains ?? [])
    .filter((domain) => domain.length > 0)
    .slice(0, MAX_TOP_DOMAINS_IN_DESCRIPTION);
  const domainsClause = domainsList.length > 0 ? ` across ${domainsList.join(", ")}` : "";
  const raw = `${input.totalCount} curated ${input.displayTag} engineering resources${annotatedClause}${domainsClause} — architecture summaries and references vetted by William Callahan.`;
  return truncateAtWordBoundary(raw, MAX_META_DESCRIPTION_CHARS);
}
