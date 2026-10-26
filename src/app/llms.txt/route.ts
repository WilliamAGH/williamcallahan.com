/**
 * llms.txt Route
 * @module app/llms.txt/route
 * @description
 * Serves the site summary for AI crawlers per https://llmstxt.org, built from the same
 * data owners as the Person JSON-LD so both disambiguate the same William Callahan.
 */

import { metadata, PAGE_METADATA } from "@/data/metadata";
import { projects } from "@/data/projects";
import { getAllPostsMeta } from "@/lib/blog";
import { generateProjectSlug } from "@/lib/projects/slug-helpers";
import type { OrganizationReference } from "@/types/seo/schema";

const MAX_RECENT_ARTICLES = 20;

const CORE_PAGE_KEYS = [
  "home",
  "experience",
  "investments",
  "projects",
  "blog",
  "bookmarks",
  "books",
  "education",
  "cv",
  "contact",
] as const satisfies ReadonlyArray<keyof typeof PAGE_METADATA>;

const singleLine = (text: string): string => text.replace(/\s+/g, " ").trim();

const formatOrganization = (organization: OrganizationReference): string =>
  organization.url ? `[${organization.name}](${organization.url})` : organization.name;

// Route Handlers are exempt from `use cache`; Cache-Control caches the output at the CDN.
export async function GET(): Promise<Response> {
  const posts = await getAllPostsMeta(false);
  const siteUrl = metadata.site.url;
  const { person } = metadata;

  const lines = [
    `# ${metadata.site.name}`,
    "",
    `> ${metadata.description}`,
    "",
    `This is the William Callahan who is ${person.jobTitle} of ${formatOrganization(person.worksFor)}; not to be confused with others of the same name.`,
    "",
    `- Founder of ${person.founder.map(formatOrganization).join(" and ")}`,
    "- Creator of Researchly and the other software listed under Featured Ventures & Software Projects",
    `- Credentials: ${person.hasCredential.map((credential) => credential.name).join(", ")}`,
    `- Alumnus of ${person.alumniOf.map(formatOrganization).join(", ")}`,
    `- Based in ${person.homeLocation.name}`,
    "",
    "## Core Pages",
    "",
    ...CORE_PAGE_KEYS.map((pageKey) => {
      const page = PAGE_METADATA[pageKey];
      const path = pageKey === "home" ? "/" : `/${pageKey}`;
      return `- [${page.title}](${siteUrl}${path}): ${singleLine(page.description)}`;
    }),
    "",
    "## Featured Ventures & Software Projects",
    "",
    ...projects.map(
      (project) =>
        `- [${project.name}](${siteUrl}/projects/${generateProjectSlug(project.name)}): ${singleLine(project.shortSummary)}`,
    ),
    "",
    "## Recent Articles",
    "",
    ...posts
      .slice(0, MAX_RECENT_ARTICLES)
      .map(
        (post) => `- [${post.title}](${siteUrl}/blog/${post.slug}): ${singleLine(post.excerpt)}`,
      ),
    "",
    "## Official Profiles",
    "",
    ...metadata.social.profiles.map(
      (profileUrl) => `- [${new URL(profileUrl).host}](${profileUrl})`,
    ),
    "",
  ];

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
