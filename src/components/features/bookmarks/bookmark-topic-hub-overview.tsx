import Link from "next/link";
import { buildBookmarkPath } from "@/lib/bookmarks/bookmark-helpers";
import { removeCitations } from "@/lib/utils/formatters";
import type { BookmarkTopicHubOverviewProps } from "@/types/seo/bookmark-graduation";

const MAX_MATRIX_TAKEAWAY_CHARS = 180;
const MAX_FIELD_NOTE_CHARS = 420;

function truncateAtWordBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const excerpt = text.slice(0, maxChars - 1);
  const boundary = excerpt.search(/\s+\S*$/);
  return `${boundary > 0 ? excerpt.slice(0, boundary) : excerpt}…`;
}

export function BookmarkTopicHubOverview({ displayTag, evidence }: BookmarkTopicHubOverviewProps) {
  return (
    <section
      aria-labelledby="topic-hub-overview-heading"
      className="space-y-8 rounded-xl border border-gray-200 bg-white p-5 text-gray-900 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100 sm:p-8"
    >
      <header className="space-y-4">
        <h2 id="topic-hub-overview-heading" className="text-2xl font-semibold tracking-tight">
          {displayTag} — Topic Overview &amp; Reference Guide
        </h2>
        <p className="leading-relaxed text-gray-600 dark:text-gray-300">
          This curated guide brings together {evidence.totalCount} vetted {displayTag} resources,
          including {evidence.analyzedCount} with structured technical analysis and{" "}
          {evidence.annotatedCount} with practitioner field notes.
          {evidence.topCategories.length > 0 &&
            ` Primary focus areas include ${evidence.topCategories.join(", ")}.`}
          {evidence.topDomains.length > 0 &&
            ` Primary sources include ${evidence.topDomains.join(", ")}.`}
        </p>
        {(evidence.topCategories.length > 0 || evidence.topDomains.length > 0) && (
          <ul aria-label="Topic categories and source domains" className="flex flex-wrap gap-2">
            {evidence.topCategories.map((category) => (
              <li
                key={`category-${category}`}
                className="rounded-full bg-gray-100 px-3 py-1 text-sm dark:bg-gray-800"
              >
                {category}
              </li>
            ))}
            {evidence.topDomains.map((domain) => (
              <li
                key={`domain-${domain}`}
                className="rounded-full border border-gray-200 px-3 py-1 text-sm dark:border-gray-700"
              >
                {domain}
              </li>
            ))}
          </ul>
        )}
      </header>

      {evidence.annotatedBookmarks.length > 0 && (
        <section aria-labelledby="topic-hub-field-notes-heading" className="space-y-4">
          <h3 id="topic-hub-field-notes-heading" className="text-xl font-semibold">
            Practitioner Field Notes
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            William’s notes from the collection, quoted in his own words.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {evidence.annotatedBookmarks.map((resource) => (
              <article
                key={resource.id}
                className="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-gray-800"
              >
                <Link
                  href={buildBookmarkPath(resource.slug)}
                  prefetch={false}
                  className="font-semibold underline decoration-gray-300 underline-offset-4 hover:decoration-current dark:decoration-gray-600"
                >
                  {resource.title}
                </Link>
                {resource.domain && (
                  <span className="block w-fit rounded-full bg-gray-100 px-2 py-1 text-xs dark:bg-gray-800">
                    {resource.domain}
                  </span>
                )}
                <blockquote className="whitespace-pre-line text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                  {truncateAtWordBoundary(resource.note ?? "", MAX_FIELD_NOTE_CHARS)}
                </blockquote>
              </article>
            ))}
          </div>
        </section>
      )}

      {evidence.matrixResources.length > 0 && (
        <section aria-labelledby="topic-hub-matrix-heading" className="space-y-4">
          <h3 id="topic-hub-matrix-heading" className="text-xl font-semibold">
            Curated {displayTag} Resource Matrix
          </h3>
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
            <section
              role="region"
              aria-labelledby="topic-hub-matrix-heading"
              tabIndex={0}
              className="focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2"
            >
              <table className="w-full min-w-[40rem] border-separate border-spacing-0 text-left text-sm">
                <caption className="sr-only">
                  Compare curated {displayTag} resources, formats, and practitioner takeaways.
                </caption>
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th scope="col" className="p-4 font-semibold">
                      Resource
                    </th>
                    <th scope="col" className="p-4 font-semibold">
                      Category &amp; Format
                    </th>
                    <th scope="col" className="p-4 font-semibold">
                      Key Takeaway &amp; Notes
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {evidence.matrixResources.map((resource) => (
                    <tr key={resource.id} className="align-top">
                      <th
                        scope="row"
                        className="sticky start-0 w-1/3 border-t border-gray-200 bg-white p-4 font-medium dark:border-gray-800 dark:bg-gray-950"
                      >
                        <Link
                          href={buildBookmarkPath(resource.slug)}
                          prefetch={false}
                          className="underline decoration-gray-300 underline-offset-4 hover:decoration-current dark:decoration-gray-600"
                        >
                          {resource.title}
                        </Link>
                        <span className="mt-1 block break-words text-xs font-normal text-gray-500 dark:text-gray-400">
                          {resource.domain}
                        </span>
                      </th>
                      <td className="border-t border-gray-200 p-4 text-gray-600 dark:border-gray-800 dark:text-gray-300">
                        {[resource.category, resource.format, resource.accessMethod]
                          .filter(Boolean)
                          .join(" / ") || "Reference"}
                      </td>
                      <td className="border-t border-gray-200 p-4 leading-relaxed text-gray-600 dark:border-gray-800 dark:text-gray-300">
                        {truncateAtWordBoundary(
                          resource.note ||
                            resource.primaryHighlight ||
                            removeCitations(resource.summary || resource.description),
                          MAX_MATRIX_TAKEAWAY_CHARS,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        </section>
      )}
    </section>
  );
}
