import { Activity, createElement, Fragment, StrictMode } from "react";
import type { ActivityProps, ReactNode } from "react";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { render } from "@testing-library/react";

import { JsonLdScript } from "@/components/seo/json-ld";
import BlogPage from "@/app/blog/page";
import { getAllPostsMeta } from "@/lib/blog";
import type { BlogPost } from "@/types/blog";

vi.mock("@/lib/blog", () => ({ getAllPostsMeta: vi.fn<typeof getAllPostsMeta>() }));
vi.mock("@/components/features/blog/blog.client", () => ({
  Blog: ({ children }: { children: ReactNode }) => children,
}));

describe("Blog collection graph", () => {
  it("lists published visible posts in order, not breadcrumbs or development drafts", async () => {
    const post: BlogPost = {
      id: "published-first",
      slug: "published-first",
      title: "First published post",
      excerpt: "An original article",
      publishedAt: "2026-01-01T12:00:00Z",
      author: { id: "owner", name: "William Callahan" },
      tags: [],
      content: { compiledSource: "", scope: {}, frontmatter: {} },
    };
    vi.mocked(getAllPostsMeta).mockResolvedValue([
      post,
      { ...post, id: "draft", slug: "draft", title: "Development draft", draft: true },
      { ...post, id: "published-last", slug: "published-last", title: "Last published post" },
    ]);

    const html = renderToStaticMarkup(await BlogPage());
    const document = new DOMParser().parseFromString(html, "text/html");
    const script = document.querySelector('script[type="application/ld+json"]');
    const graph: unknown = JSON.parse(script?.textContent ?? "null");
    expect(graph).toMatchObject({
      "@graph": expect.arrayContaining([
        expect.objectContaining({
          "@type": "CollectionPage",
          mainEntity: {
            "@type": "ItemList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                url: "https://williamcallahan.com/blog/published-first",
              },
              {
                "@type": "ListItem",
                position: 2,
                url: "https://williamcallahan.com/blog/published-last",
              },
            ],
          },
        }),
      ]),
    });
    expect(
      Array.from(document.querySelectorAll("h2 a"), (link) => link.getAttribute("href")),
    ).toEqual(["/blog/published-first", "/blog/draft", "/blog/published-last"]);
  });

  it("does not invent breadcrumb members for an empty published collection", async () => {
    vi.mocked(getAllPostsMeta).mockResolvedValue([]);
    const document = new DOMParser().parseFromString(
      renderToStaticMarkup(await BlogPage()),
      "text/html",
    );
    const script = document.querySelector('script[type="application/ld+json"]');
    const graph: unknown = JSON.parse(script?.textContent ?? "null");
    expect(graph).not.toMatchObject({
      "@graph": expect.arrayContaining([expect.objectContaining({ "@type": "CollectionPage" })]),
    });
    expect(graph).toMatchObject({
      "@graph": expect.arrayContaining([expect.objectContaining({ "@type": "Person" })]),
    });
  });
});

type ActivityElementProps = ActivityProps & { readonly key?: string };

function createActivity(props: ActivityElementProps) {
  return createElement(Activity, props);
}

describe("JsonLdScript", () => {
  it("renders parseable structured data as a native script element", () => {
    const data = {
      "@context": "https://schema.org",
      name: "Markup safety </script><!--",
    };

    const html = renderToStaticMarkup(createElement(JsonLdScript, { data, id: "page-schema" }));
    const scriptContent = html.match(
      /^<script type="application\/ld\+json" id="page-schema">(.*)<\/script>$/s,
    );

    expect(scriptContent).not.toBeNull();
    if (!scriptContent) {
      throw new Error("JSON-LD script did not render");
    }

    expect(html).not.toContain("self.__next_s");
    expect(scriptContent[1]).toContain("\\u003c/script>");
    expect(JSON.parse(scriptContent[1])).toEqual(data);
  });

  it.each([false, true])(
    "exposes only graphs from visible Activity routes (strict mode: %s)",
    (strictMode) => {
      const articleGraph = { "@type": "Article", name: "Article" };
      const softwareGraph = { "@type": "SoftwareApplication", name: "Software" };
      const collectionGraph = { "@type": "CollectionPage", name: "Tag" };

      function RouteActivities({
        activeRoute,
        hasVisitedTag,
      }: Readonly<{ activeRoute: "article" | "tag"; hasVisitedTag: boolean }>) {
        const articleActivity = createActivity({
          key: "article",
          mode: activeRoute === "article" ? "visible" : "hidden",
          children: [
            createElement(JsonLdScript, { data: articleGraph }),
            createElement(JsonLdScript, { data: softwareGraph }),
          ],
        });
        const tagActivity = createActivity({
          key: "tag",
          mode: activeRoute === "tag" ? "visible" : "hidden",
          children: createElement(JsonLdScript, { data: collectionGraph }),
        });
        const routeActivities =
          activeRoute === "tag"
            ? [tagActivity, articleActivity]
            : hasVisitedTag
              ? [articleActivity, tagActivity]
              : [articleActivity];
        const content = createElement(Fragment, null, ...routeActivities);

        return strictMode ? createElement(StrictMode, null, content) : content;
      }

      const rendered = render(
        createElement(RouteActivities, { activeRoute: "article", hasVisitedTag: false }),
      );
      const readGraphs = () =>
        Array.from(
          document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]'),
          (script) => JSON.parse(script.textContent ?? ""),
        );

      expect(readGraphs()).toEqual([articleGraph, softwareGraph]);

      rendered.rerender(
        createElement(RouteActivities, { activeRoute: "tag", hasVisitedTag: true }),
      );
      expect(readGraphs()).toEqual([collectionGraph]);

      rendered.rerender(
        createElement(RouteActivities, { activeRoute: "article", hasVisitedTag: true }),
      );
      expect(readGraphs()).toEqual([articleGraph, softwareGraph]);
    },
  );

  it("hydrates server-prerendered JSON-LD without dropping the active graph", () => {
    const data = { "@type": "WebPage", name: "Hydrated page" };
    const element = createElement(JsonLdScript, { data });
    const container = document.createElement("div");
    container.innerHTML = renderToString(element);
    document.body.append(container);

    render(element, {
      container,
      hydrate: true,
      onRecoverableError(error) {
        throw error;
      },
    });

    const script = container.querySelector<HTMLScriptElement>('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    expect(JSON.parse(script?.textContent ?? "")).toEqual(data);
  });

  it("keeps a client-mounted hidden Activity semantically inert", () => {
    const data = { "@type": "Article", name: "Deferred hidden graph" };

    render(
      createActivity({
        mode: "hidden",
        children: createElement(JsonLdScript, { data }),
      }),
    );

    expect(document.querySelector('script[type="application/ld+json"]')).toBeNull();
    const inactiveScript = document.querySelector('script[type="application/json"]');
    expect(inactiveScript).not.toBeNull();
    expect(JSON.parse(inactiveScript?.textContent ?? "")).toEqual(data);
  });
});

describe("getNotFoundMetadata", () => {
  it("emits noindex and never a canonical for missing entities", async () => {
    const { getNotFoundMetadata } = await import("@/lib/seo/not-found-metadata");
    const metadata = getNotFoundMetadata("Project");

    expect(metadata.title).toBe("Project Not Found");
    expect(metadata.description).toBe("The requested project could not be found.");
    expect(metadata.robots).toEqual({ index: false, follow: false });
    // A nonexistent URL must never self-canonicalize, inherit the layout
    // canonical, or carry share metadata.
    expect(metadata.alternates).toEqual({ canonical: null });
    expect(metadata.openGraph).toBeUndefined();
  });
});
