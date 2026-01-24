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
 * @see {@link @/lib/utils/url-utils} for canonical URL extraction utilities
 */

import { ensureProtocol, stripWwwPrefix } from "@/lib/utils/url-utils";

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
 * - AI chat platforms: ChatGPT, Claude, Perplexity, etc.
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
  "notion.so",

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

  // AI chat & conversation platforms
  "chat.openai.com",
  "chatgpt.com",
  "claude.ai",
  "perplexity.ai",

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
 * 3. Checking explicit domain match first (e.g., docs.google.com)
 * 4. Falling back to parent domain (eTLD+1) if subdomain not explicitly listed
 *
 * @param domain - The domain to check (e.g., "youtube.com", "www.reddit.com", "old.reddit.com")
 * @returns true if the domain or its parent domain is in the content-sharing whitelist
 *
 * @example
 * isContentSharingDomain("youtube.com") // → true
 * isContentSharingDomain("www.reddit.com") // → true
 * isContentSharingDomain("old.reddit.com") // → true (falls back to reddit.com)
 * isContentSharingDomain("docs.google.com") // → true (explicit match)
 * isContentSharingDomain("random.google.com") // → false (google.com not in list)
 * isContentSharingDomain("example.com") // → false
 */
export function isContentSharingDomain(domain: string): boolean {
  const normalized = stripWwwPrefix(domain.toLowerCase());

  // First, check for exact match (handles explicit subdomain entries like docs.google.com)
  if (CONTENT_SHARING_DOMAINS.includes(normalized as (typeof CONTENT_SHARING_DOMAINS)[number])) {
    return true;
  }

  // If no exact match, try parent domain (eTLD+1) fallback
  // This handles cases like old.reddit.com → reddit.com
  const parts = normalized.split(".");
  if (parts.length >= 3) {
    // Extract parent domain (last two parts: domain.tld)
    const parentDomain = parts.slice(-2).join(".");
    if (CONTENT_SHARING_DOMAINS.includes(parentDomain as (typeof CONTENT_SHARING_DOMAINS)[number])) {
      return true;
    }
  }

  return false;
}

/**
 * Extract domain from URL for content-sharing domain detection.
 *
 * **Nullability Contract:** Returns `null` when URL parsing fails. Callers
 * should handle null appropriately (e.g., skip content-sharing checks).
 *
 * @param url - The URL to extract domain from
 * @returns Normalized domain string, or `null` if URL is unparseable
 *
 * @example
 * extractDomainForContentCheck("https://www.youtube.com/watch?v=abc") // → "youtube.com"
 * extractDomainForContentCheck("http://reddit.com/r/programming") // → "reddit.com"
 * extractDomainForContentCheck("invalid") // → null
 *
 * @see {@link @/lib/utils/url-utils#extractDomain} for the canonical domain extraction utility
 */
export function extractDomainForContentCheck(url: string): string | null {
  try {
    const urlObj = new URL(ensureProtocol(url));
    return stripWwwPrefix(urlObj.hostname);
  } catch {
    // URL parsing failed - return null to signal caller should handle this case
    return null;
  }
}
