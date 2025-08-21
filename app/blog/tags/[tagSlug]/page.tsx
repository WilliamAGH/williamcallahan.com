import fs from "node:fs";
import path from "node:path";
import { BlogList } from "@/components/features/blog/blog-list";
import { Blog } from "@/components/features/blog/blog.client";
import { JsonLdScript } from "@/components/seo/json-ld";
import { generateSchemaGraph } from "@/lib/seo/schema";
import { metadata } from "@/data/metadata";
import { ensureAbsoluteUrl } from "@/lib/seo/utils";
import { generateDynamicTitle, generateTagDescription, formatTagDisplay } from "@/lib/seo/dynamic-metadata";
import { deslugify, kebabCase } from "@/lib/utils/formatters";
import type { Author, BlogPost, BlogPageFrontmatter } from "@/types/blog";
import matter from "gray-matter";
import type { Metadata } from "next";
import { getStaticImageUrl } from "@/lib/data-access/static-images";

import type { JSX } from "react";

// Directory where blog posts are stored
const postsDirectory = path.join(process.cwd(), "data/blog/posts");

// Define the primary author based on site metadata
const primaryAuthor: Author = {
  id: "william-callahan", // Assuming a fixed ID for the main author
  name: metadata.author,
  // Add avatar/bio/url if available in metadata or define statically
  url: metadata.social.profiles.find(p => p.includes("linkedin")) || metadata.url,
  avatar: getStaticImageUrl("/images/william.jpeg"), // Example static avatar
};

/**
 * Fetches and parses all blog posts from the filesystem, returning full BlogPost objects.
 * @returns {Promise<BlogPost[]>} A promise that resolves to an array of blog post data.
 */
function getAllPosts(): BlogPost[] {
  try {
    const filenames = fs.readdirSync(postsDirectory);

    const posts = filenames
      .filter(filename => filename.endsWith(".mdx"))
      .map(filename => {
        const filePath = path.join(postsDirectory, filename);
        const fileContents = fs.readFileSync(filePath, "utf8");
        // Cast the frontmatter data to the defined interface, via unknown
        const { data: frontmatter, content: rawContent } = matter(fileContents) as unknown as {
          data: BlogPageFrontmatter;
          content: string;
        };
        const slug = filename.replace(/\.mdx$/, "");

        // Basic validation using the typed frontmatter
        if (!frontmatter.title || !frontmatter.publishedAt || !frontmatter.tags || !frontmatter.author) {
          console.warn(`Skipping post ${filename}: Missing essential frontmatter (title, publishedAt, tags, author)`);
          return null;
        }

        // For now, assume all posts use the primaryAuthor
        // Later, enhance this to map frontmatter.author ID to a list of authors if needed
        const postAuthor = primaryAuthor;

        return {
          id: slug, // Use slug as ID for now
          slug,
          title: frontmatter.title, // Now frontmatter.title is string
          excerpt: frontmatter.excerpt || "", // frontmatter.excerpt is string | undefined
          // Simulate MDXRemoteSerializeResult - not needed for list view
          content: { compiledSource: "", scope: {}, frontmatter: {} },
          rawContent: rawContent,
          publishedAt: String(frontmatter.publishedAt), // Convert Date to string if necessary
          updatedAt: frontmatter.updatedAt ? String(frontmatter.updatedAt) : undefined,
          author: postAuthor, // Assign the determined author object
          // Ensure tags is an array of strings
          tags: Array.isArray(frontmatter.tags) ? frontmatter.tags.map(String) : [],
          coverImage: frontmatter.coverImage || undefined, // frontmatter.coverImage is string | undefined
        } as BlogPost;
      })
      .filter((post): post is BlogPost => post !== null)
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    return posts;
  } catch (error) {
    console.error("Error reading blog posts directory:", error);
    return [];
  }
}

/**
 * Generates static paths for all unique tags.
 * @returns {Promise<{ tagSlug: string }[]>} An array of objects containing tag slugs.
 */
export async function generateStaticParams(): Promise<{ tagSlug: string }[]> {
  // Use Promise.resolve to satisfy require-await and await-thenable rules
  const posts = await Promise.resolve(getAllPosts());
  const tags = new Set<string>();
  for (const post of posts) {
    for (const tag of post.tags) {
      tags.add(kebabCase(tag));
    }
  }
  return Array.from(tags).map(tag => ({ tagSlug: tag }));
}

/**
 * Generates metadata for the tag page.
 * @param {object} params - The route parameters.
 * @param {string} params.tagSlug - The slug of the tag.
 * @returns {Promise<Metadata>} The metadata object for the page.
 */
export async function generateMetadata({ params }: { params: { tagSlug: string } }): Promise<Metadata> {
  // Use Promise.resolve to satisfy require-await rule
  const tagName = await Promise.resolve(formatTagDisplay(deslugify(params.tagSlug)));
  const title = generateDynamicTitle(`${tagName} Posts`, "blog", { isTag: true });
  const description = generateTagDescription(tagName, "blog");
  const url = ensureAbsoluteUrl(`/blog/tags/${params.tagSlug}`);

  return {
    title: title,
    description: description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: title,
      description: description,
      url: url,
      siteName: metadata.site.name,
      type: "website",
      locale: "en_US",
      images: metadata.openGraph.images, // Use openGraph images
    },
    twitter: {
      card: "summary_large_image",
      title: title,
      description: description,
      images: metadata.openGraph.images, // Use openGraph images for Twitter too
      creator: metadata.social.twitter, // Use correct path for Twitter handle
    },
  };
}

/**
 * Renders the page displaying blog posts filtered by a specific tag.
 * @param {object} params - The route parameters.
 * @param {string} params.tagSlug - The URL-friendly tag slug.
 * @returns {JSX.Element} The rendered page component.
 */
export default async function TagPage({ params }: { params: { tagSlug: string } }): Promise<JSX.Element> {
  const { tagSlug } = params;
  const allPosts = getAllPosts();

  const filteredPosts = allPosts.filter(post => post.tags.map((tag: string) => kebabCase(tag)).includes(tagSlug));

  // Wrap in Promise.resolve to satisfy linter's await-thenable rule
  const tagName = await Promise.resolve(formatTagDisplay(deslugify(tagSlug)));
  const title = generateDynamicTitle(`${tagName} Posts`, "blog", { isTag: true });
  const description = generateTagDescription(tagName, "blog");

  const itemList = filteredPosts.map((post, idx) => ({
    url: ensureAbsoluteUrl(`/blog/${post.slug}`),
    position: idx + 1,
  }));

  const nowIso = new Date().toISOString();

  const jsonLdData = generateSchemaGraph({
    path: `/blog/tags/${tagSlug}`,
    title,
    description,
    datePublished: nowIso,
    dateModified: nowIso,
    type: "collection",
    itemList,
    breadcrumbs: [
      { path: "/", name: "Home" },
      { path: "/blog", name: "Blog" },
      { path: `/blog/tags/${tagSlug}`, name: `${tagName} Posts` },
    ],
  });

  // Create the window title with the tag slug
  const windowTitle = `~/blog/tags/${tagSlug}`;

  return (
    <>
      <JsonLdScript data={jsonLdData} />
      <Blog windowTitle={windowTitle}>
        <div className="container mx-auto px-4 py-8">
          <h1 className="mb-8 text-3xl font-bold leading-tight tracking-tighter text-primary md:text-5xl">
            <span className="capitalize">{tagName}</span> Posts
          </h1>
          {filteredPosts.length > 0 ? <BlogList posts={filteredPosts} /> : <p>No posts found for this tag.</p>}
        </div>
      </Blog>
    </>
  );
}
