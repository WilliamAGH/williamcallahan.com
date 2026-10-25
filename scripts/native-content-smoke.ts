import { load } from "cheerio";

/** Verify native markup, not matching strings inside serialized Flight data. */
export function validateNativeContentHtml(
  html: string,
  expected: {
    heading: string;
    destination: string;
    destinationScope?: string;
    description?: string;
  },
): boolean {
  const $ = load(html);
  const hasHeading = $("h1")
    .toArray()
    .some((node) => $(node).text().trim() === expected.heading);
  const links = expected.destinationScope
    ? $(expected.destinationScope).find("a[href]")
    : $("a[href]");
  const hasDestination = links
    .toArray()
    .some((node) => $(node).attr("href") === expected.destination);
  const hasDescription =
    expected.description === undefined ||
    $("p")
      .toArray()
      .some((node) => $(node).text().trim() === expected.description);
  return hasHeading && hasDestination && hasDescription;
}
