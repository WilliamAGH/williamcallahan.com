/**
 * Smoke-tests the blog MDX pipeline – verifies every post parses via
 * `getMDXPost`, has a valid slug, and that the posts directory is non-empty.
 * Network calls are mocked (`listS3Objects`) so it runs offline; suite timeout
 * set to 60 s for slow machines.
 */

// Suite-specific timeout for slow environments
vi.setConfig({ testTimeout: 60_000 });

// Mock the S3 directory listing to avoid network latency/timeouts
vi.mock("@/lib/s3/objects", () => ({
  listS3Objects: vi.fn().mockResolvedValue([]),
}));

import { renderToReadableStream } from "react-dom/server";
import { render } from "@testing-library/react";
import React from "react";
import { NextRequest } from "next/server";
import type { TweetProps } from "react-tweet";
import type { BlogPost } from "@/types/blog";
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { blogFrontmatterSchema } from "@/types/schemas/blog-frontmatter";
// IMPORTANT: Use the real serializer. Keep ESM rehype/remark plugins mocked by config.
vi.doUnmock("next-mdx-remote/serialize");
vi.doUnmock("next-mdx-remote");

import { getMDXPost } from "../../src/lib/blog/mdx";

type GetPostBySlug = typeof import("@/lib/blog").getPostBySlug;
type GenerateSchemaGraph = typeof import("@/lib/seo/schema").generateSchemaGraph;
type BlogPostPageComponent = typeof import("@/app/blog/[slug]/page").default;

const { mockGenerateSchemaGraph, mockGetPostBySlug } = vi.hoisted(() => ({
  mockGenerateSchemaGraph: vi.fn<GenerateSchemaGraph>(),
  mockGetPostBySlug: vi.fn<GetPostBySlug>(),
}));

vi.mock("@/lib/blog.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/blog")>()),
  getPostBySlug: mockGetPostBySlug,
}));

vi.mock("@/lib/seo/schema", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/seo/schema")>();
  mockGenerateSchemaGraph.mockImplementation(actual.generateSchemaGraph);
  return {
    ...actual,
    generateSchemaGraph: mockGenerateSchemaGraph,
  };
});

const POSTS_DIRECTORY = path.join(process.cwd(), "data/blog/posts");

describe("Blog MDX Smoke Tests", () => {
  let mdxFiles: string[] = [];

  beforeAll(async () => {
    try {
      const files = await fs.readdir(POSTS_DIRECTORY);
      mdxFiles = files.filter((file) => file.endsWith(".mdx"));
      console.log(`Found ${mdxFiles.length} MDX files in ${POSTS_DIRECTORY}`);
    } catch (error) {
      console.error("Failed to read blog posts directory:", POSTS_DIRECTORY, error);
      throw error; // Fail the setup
    }

    if (mdxFiles.length === 0) {
      console.warn(`No .mdx files found in ${POSTS_DIRECTORY}. Skipping file tests.`);
    }
  });

  it("blog post directory exists and contains MDX files", () => {
    expect(mdxFiles.length).toBeGreaterThan(0);
  });

  it("rejects whitespace-padded canonical slugs", () => {
    expect(
      blogFrontmatterSchema.safeParse({
        slug: " invalid-slug ",
        title: "Invalid slug",
        author: "william-callahan",
        publishedAt: "2026-01-01",
        excerpt: "Invalid slug fixture.",
      }).success,
    ).toBe(false);
  });

  it("bypasses the Next optimizer for proxied tweet images", async () => {
    type MockTweetProps = Required<Pick<TweetProps, "components">>;
    vi.resetModules();
    vi.doMock("next/dynamic", () => ({
      default:
        () =>
        ({ components }: MockTweetProps) => {
          const AvatarImg = components?.AvatarImg;
          if (AvatarImg === undefined) {
            throw new Error("Tweet mock requires an AvatarImg component");
          }
          return React.createElement(AvatarImg, {
            src: "https://pbs.twimg.com/profile_images/1/avatar_normal.jpg",
            alt: "Tweet avatar",
            width: 48,
            height: 48,
          });
        },
    }));
    try {
      const { TweetEmbed } = await import("@/components/features/blog/tweet-embed");
      const view = render(React.createElement(TweetEmbed, { url: "https://x.com/user/status/1" }));
      expect(view.getByTestId("next-image-mock")).toHaveAttribute("data-unoptimized", "true");
      view.unmount();
    } finally {
      vi.doUnmock("next/dynamic");
      vi.resetModules();
    }
  });

  it("accepts extensionless Twitter media with a validated image format", async () => {
    const getImage = vi.fn().mockResolvedValue({
      buffer: Buffer.from([1]),
      contentType: "image/jpeg",
      source: "network",
    });
    vi.doMock("@/lib/services/unified-image-service", () => ({
      getUnifiedImageService: () => ({ getImage }),
    }));
    try {
      const { GET } = await import("@/app/api/twitter-image/[...path]/route");
      const request = new NextRequest(
        "https://williamcallahan.com/api/twitter-image/media/GrfJDHibgAAIQ3o?format=jpg&name=large&dpl=release-123",
      );
      const response = await GET(request, {
        params: Promise.resolve({ path: ["media", "GrfJDHibgAAIQ3o"] }),
      });
      expect(response.status).toBe(200);
      expect(getImage).toHaveBeenCalledWith(
        "https://pbs.twimg.com/media/GrfJDHibgAAIQ3o?format=jpg&name=large",
        { type: "twitter-media" },
      );
    } finally {
      vi.doUnmock("@/lib/services/unified-image-service");
      vi.resetModules();
    }
  });

  it("all blog posts have valid frontmatter", async () => {
    await Promise.all(
      mdxFiles.map(async (fileName) => {
        const fullPath = path.join(POSTS_DIRECTORY, fileName);
        let fileContents: string;

        try {
          fileContents = await fs.readFile(fullPath, "utf8");
        } catch (readError) {
          console.error(`Failed to read file ${fileName}:`, readError);
          expect(readError).toBeNull(); // Fail test if file can't be read
          return;
        }

        const frontmatter = blogFrontmatterSchema.parse(matter(fileContents).data);

        expect(frontmatter.slug).toEqual(expect.any(String));
        expect(frontmatter.slug.trim()).not.toBe("");
      }),
    );
  });

  it("all blog posts can be processed by getMDXPost", async () => {
    await Promise.all(
      mdxFiles.map(async (fileName) => {
        const fullPath = path.join(POSTS_DIRECTORY, fileName);
        const fileContents = await fs.readFile(fullPath, "utf8");
        const frontmatter = blogFrontmatterSchema.parse(matter(fileContents).data);
        const frontmatterSlug = frontmatter.slug.trim();

        const post = await getMDXPost(frontmatterSlug, fullPath, fileContents);

        // Check that the post was processed correctly
        expect(post).not.toBeNull();
        if (post) {
          expect(post.title).toEqual(expect.any(String));
          expect(post.title.length).toBeGreaterThan(0);
          expect(post.content).toBeDefined();
          // Verify other critical properties as needed
          expect(post.slug).toBe(frontmatterSlug);
        }
      }),
    );
  });
});

const BLOG_POST_FOR_RENDER_ERROR = {
  id: "blog-post",
  title: "Blog post",
  slug: "blog-post",
  excerpt: "A test blog post.",
  content: {
    compiledSource: "",
    scope: {},
    frontmatter: {},
  },
  publishedAt: "2026-01-01T00:00:00.000Z",
  author: {
    id: "author",
    name: "Author",
  },
  tags: [],
} satisfies BlogPost;

describe("Blog post 404 control flow", () => {
  let BlogPostPage: BlogPostPageComponent;
  let notFound: typeof import("next/navigation").notFound;

  beforeAll(async () => {
    ({ notFound } = await import("next/navigation"));
    const pageModule = await import("@/app/blog/[slug]/page");
    BlogPostPage = pageModule.default;
  });

  beforeEach(() => {
    mockGenerateSchemaGraph.mockReset();
    mockGetPostBySlug.mockReset();
    vi.mocked(notFound).mockReset();
  });

  async function captureBlogPostRenderOutcome(slug: string): Promise<{
    completionError: Error | undefined;
    reportedError: Error | undefined;
  }> {
    let reportedError: Error | undefined;
    const stream = await renderToReadableStream(
      React.createElement(BlogPostPage, {
        params: Promise.resolve({ slug }),
      }),
      {
        onError(error) {
          if (reportedError === undefined && error instanceof Error) {
            reportedError = error;
          }
        },
      },
    );

    const completionError = await stream.allReady.then(
      () => undefined,
      (error: unknown) => {
        if (!(error instanceof Error)) {
          throw error;
        }
        return error;
      },
    );
    const reader = stream.getReader();
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
    }

    return { completionError, reportedError };
  }

  it("preserves Next's notFound error for a missing post without logging", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const notFoundError = new Error("NEXT_HTTP_ERROR_FALLBACK;404");
      vi.mocked(notFound).mockImplementation(() => {
        throw notFoundError;
      });
      mockGetPostBySlug.mockResolvedValueOnce(null);

      const outcome = await captureBlogPostRenderOutcome("missing-post");
      expect(outcome.reportedError).toBe(notFoundError);
      expect(outcome.completionError).toBeUndefined();
      expect(notFound).toHaveBeenCalledOnce();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("propagates a post lookup failure instead of converting it to notFound", async () => {
    const lookupError = new Error("Blog post lookup failed");
    const notFoundError = new Error("NEXT_HTTP_ERROR_FALLBACK;404");
    vi.mocked(notFound).mockImplementation(() => {
      throw notFoundError;
    });
    mockGetPostBySlug.mockRejectedValueOnce(lookupError);

    const outcome = await captureBlogPostRenderOutcome("available-post");
    expect(outcome.reportedError).toBe(lookupError);
    expect(outcome.completionError).toBeUndefined();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("propagates a render failure instead of converting it to notFound", async () => {
    const renderError = new Error("Blog post schema rendering failed");
    const notFoundError = new Error("NEXT_HTTP_ERROR_FALLBACK;404");
    vi.mocked(notFound).mockImplementation(() => {
      throw notFoundError;
    });
    mockGetPostBySlug.mockResolvedValueOnce(BLOG_POST_FOR_RENDER_ERROR);
    mockGenerateSchemaGraph.mockImplementationOnce(() => {
      throw renderError;
    });

    const outcome = await captureBlogPostRenderOutcome("blog-post");
    expect(outcome.reportedError).toBe(renderError);
    expect(outcome.completionError).toBeUndefined();
    expect(notFound).not.toHaveBeenCalled();
  });
});
