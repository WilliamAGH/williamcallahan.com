/**
 * Content-Sharing Domain Configuration
 *
 * Defines domains where multiple pieces of content share the same base domain structure.
 * For these domains, slug generation uses title-based natural language slugs instead of
 * URL path-based slugs to prevent collisions.
 *
 * Example Problem (without title-based slugs):
 * - youtube.com/watch?v=abc123 → "youtube-com-watch"
 * - youtube.com/watch?v=xyz789 → "youtube-com-watch" ❌ COLLISION!
 *
 * Example Solution (with title-based slugs):
 * - youtube.com/watch?v=abc123 + "How to Use OpenAI" → "youtube-how-to-use-openai"
 * - youtube.com/watch?v=xyz789 + "React Best Practices" → "youtube-react-best-practices"
 *
 * @module lib/config/content-sharing-domains
 */

/**
 * Readonly array of domains where content is shared across many URLs.
 * These domains require title-based slug generation to avoid collisions.
 *
 * Categories:
 * - Video platforms: YouTube, Vimeo, etc.
 * - Social media: Twitter/X, LinkedIn, etc.
 * - Content platforms: Medium, Substack, Dev.to, etc.
 * - Code hosting: GitHub, GitLab, StackOverflow, etc.
 * - Blog platforms: WordPress, Blogspot, Tumblr, etc.
 */
export const CONTENT_SHARING_DOMAINS = [
  // Video platforms
  "youtube.com",
  "youtu.be",
  "vimeo.com",
  "dailymotion.com",
  "twitch.tv",

  // Social media & community platforms
  "reddit.com",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "tiktok.com",

  // Content & blogging platforms
  "medium.com",
  "substack.com",
  "dev.to",
  "hashnode.dev",
  "wordpress.com",
  "blogspot.com",
  "tumblr.com",
  "notion.site",

  // Code hosting & developer platforms
  "github.com",
  "gitlab.com",
  "stackoverflow.com",
  "stackexchange.com",
  "codepen.io",
  "codesandbox.io",
  "replit.com",

  // News & media platforms
  "news.ycombinator.com",
  "producthunt.com",
  "quora.com",

  // Learning platforms
  "udemy.com",
  "coursera.org",
  "edx.org",
  "khanacademy.org",

  // Google Workspace / Cloud Storage (multiple documents per domain)
  "docs.google.com",
  "sheets.google.com",
  "slides.google.com",
  "forms.google.com",
  "drive.google.com",

  // Other cloud storage / document platforms
  "dropbox.com",
  "onedrive.live.com",
  "sharepoint.com",
  "airtable.com",
  "coda.io",
  "miro.com",
  "figma.com",
  "canva.com",
] as const;

/**
 * Checks if a given domain is a content-sharing platform.
 *
 * Normalizes the input by:
 * 1. Converting to lowercase
 * 2. Removing 'www.' prefix
 *
 * @param domain - The domain to check (e.g., "youtube.com", "www.reddit.com")
 * @returns true if the domain is in the content-sharing whitelist
 *
 * @example
 * isContentSharingDomain("youtube.com") // → true
 * isContentSharingDomain("www.reddit.com") // → true
 * isContentSharingDomain("example.com") // → false
 */
export function isContentSharingDomain(domain: string): boolean {
  const normalized = domain.toLowerCase().replace(/^www\./, "");
  return CONTENT_SHARING_DOMAINS.includes(normalized as (typeof CONTENT_SHARING_DOMAINS)[number]);
}

/**
 * Extract domain from URL for content-sharing domain detection.
 *
 * @param url - The URL to extract domain from
 * @returns Normalized domain string or null if invalid URL
 *
 * @example
 * extractDomain("https://www.youtube.com/watch?v=abc") // → "youtube.com"
 * extractDomain("http://reddit.com/r/programming") // → "reddit.com"
 */
export function extractDomain(url: string): string | null {
  try {
    const urlObj = new URL(url.startsWith("http") ? url : `https://${url}`);
    return urlObj.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
