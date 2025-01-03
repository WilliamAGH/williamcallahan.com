import { generateSitemap, getFileModificationDate } from "../../lib/seo";
import { getAllPosts } from "../../lib/blog";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Static pages in the application
 */
const STATIC_PAGES = ["/", "/blog", "/experience", "/education", "/investments"];

/**
 * Get the file path for a page
 * @param pagePath - The URL path of the page
 * @returns The file system path
 */
function getPageFilePath(pagePath: string): string {
  const normalizedPath = pagePath === "/" ? "/page" : `${pagePath}/page`;
  return path.join(process.cwd(), "app", `${normalizedPath}.tsx`);
}

/**
 * Generate sitemap.xml file
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/route
 */
export async function GET(): Promise<Response> {
  try {
    // Get all blog posts
    const posts = await getAllPosts();

    // Get modification dates for static pages
    const staticPageUrls = await Promise.all(
      STATIC_PAGES.map(async (pagePath) => {
        let lastmod: string | undefined;
        try {
          // Try to get the modification date of the page file
          const filePath = getPageFilePath(pagePath);
          lastmod = await getFileModificationDate(filePath);
        } catch (error: unknown) {
          // If file doesn't exist or can't be read, skip the lastmod
          console.error(`Error getting modification date for ${pagePath}:`, error);
        }
        return { path: pagePath, lastmod };
      })
    );

    // Get blog post URLs with their modification dates
    const blogPostUrls = posts.map((post) => ({
      path: `/blog/${post.slug}`,
      lastmod: post.updatedAt || post.publishedAt,
    }));

    // Combine all URLs
    const allUrls = [...staticPageUrls, ...blogPostUrls];

    // Generate sitemap XML
    const sitemap = generateSitemap(allUrls);

    // Return the sitemap with proper content type
    return new Response(sitemap, {
      headers: {
        "Content-Type": "application/xml",
      },
    });
  } catch (error: unknown) {
    console.error("Error generating sitemap:", error);
    return new Response("Error generating sitemap", { status: 500 });
  }
}
